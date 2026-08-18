package main

import (
	"archive/zip"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	protocolScheme    = "pacs-radiant"
	portalBaseURL     = "https://lauds.com.br"
	maxExpandedBytes  = int64(5 * 1024 * 1024 * 1024)
	cleanupAfterHours = 48
)

var tokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{32,128}$`)

func main() {
	if len(os.Args) != 2 {
		showMessage("Assistente RadiAnt", "O Assistente está instalado. Volte ao Portal e clique em RadiAnt para abrir um estudo autorizado.")
		return
	}

	if err := openAuthorizedStudy(os.Args[1]); err != nil {
		showMessage("Assistente RadiAnt", err.Error())
	}
}

func openAuthorizedStudy(rawURI string) error {
	parsed, err := url.Parse(rawURI)
	if err != nil || parsed.Scheme != protocolScheme || parsed.Host != "open" {
		return errors.New("O comando de abertura do RadiAnt é inválido")
	}

	token := strings.Trim(parsed.Path, "/")
	if !tokenPattern.MatchString(token) {
		return errors.New("O token de estudo é inválido")
	}

	radiantPath, err := findRadiantExecutable()
	if err != nil {
		return errors.New("RadiAnt não foi encontrado neste computador. Instale ou ative o RadiAnt e tente novamente")
	}

	root, err := os.UserCacheDir()
	if err != nil {
		return errors.New("Não foi possível preparar o diretório temporário")
	}
	studiesRoot := filepath.Join(root, "PacsRadiantAssistant", "studies")
	if err := os.MkdirAll(studiesRoot, 0o700); err != nil {
		return errors.New("Não foi possível criar o diretório temporário")
	}
	cleanOldStudies(studiesRoot)

	workRoot, err := os.MkdirTemp(studiesRoot, "study-")
	if err != nil {
		return errors.New("Não foi possível reservar espaço para o estudo")
	}

	zipPath := filepath.Join(workRoot, "study.zip")
	dicomPath := filepath.Join(workRoot, "dicom")
	if err := downloadStudy(token, zipPath); err != nil {
		os.RemoveAll(workRoot)
		return err
	}
	if err := extractDicomZip(zipPath, dicomPath); err != nil {
		os.RemoveAll(workRoot)
		return err
	}
	_ = os.Remove(zipPath)

	if err := exec.Command(radiantPath, "-d", dicomPath).Start(); err != nil {
		return errors.New("Não foi possível iniciar o RadiAnt para abrir o estudo")
	}
	showMessage("Assistente RadiAnt", "O estudo autorizado foi aberto no RadiAnt. As configurações existentes do RadiAnt não foram alteradas.")
	return nil
}

func downloadStudy(token, destination string) error {
	requestURL := portalBaseURL + "/api/radiant-assistant-download/" + token
	client := &http.Client{Timeout: 30 * time.Minute}
	response, err := client.Get(requestURL)
	if err != nil {
		return errors.New("Não foi possível baixar o estudo autorizado do Portal")
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusGone {
		return errors.New("O link do estudo expirou ou já foi utilizado. Volte ao Portal e clique em RadiAnt novamente")
	}
	if response.StatusCode != http.StatusOK {
		return errors.New("O Portal não conseguiu disponibilizar o estudo para o RadiAnt")
	}
	if response.ContentLength > maxExpandedBytes {
		return errors.New("O estudo excede o limite permitido para abertura temporária")
	}

	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return errors.New("Não foi possível salvar o estudo temporário")
	}
	defer output.Close()
	_, err = io.Copy(output, io.LimitReader(response.Body, maxExpandedBytes+1))
	if err != nil {
		return errors.New("O download do estudo foi interrompido")
	}
	return nil
}

func extractDicomZip(zipPath, destination string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return errors.New("O pacote temporário recebido não é válido")
	}
	defer reader.Close()

	if err := os.MkdirAll(destination, 0o700); err != nil {
		return errors.New("Não foi possível preparar os arquivos do estudo")
	}

	var expanded int64
	files := 0
	for _, file := range reader.File {
		if file.FileInfo().IsDir() || !strings.EqualFold(filepath.Ext(file.Name), ".dcm") {
			continue
		}
		if strings.Contains(file.Name, "..") || filepath.IsAbs(file.Name) {
			return errors.New("O pacote temporário contém caminho inválido")
		}
		expanded += int64(file.UncompressedSize64)
		if expanded > maxExpandedBytes {
			return errors.New("O estudo excede o limite permitido para abertura temporária")
		}

		target := filepath.Join(destination, filepath.Base(file.Name))
		input, err := file.Open()
		if err != nil {
			return errors.New("Não foi possível ler uma imagem do estudo")
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if err == nil {
			_, err = io.Copy(output, io.LimitReader(input, int64(file.UncompressedSize64)+1))
			output.Close()
		}
		input.Close()
		if err != nil {
			return errors.New("Não foi possível preparar uma imagem do estudo")
		}
		files++
	}
	if files == 0 {
		return errors.New("O estudo temporário não contém imagens DICOM")
	}
	return nil
}

func cleanOldStudies(root string) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-cleanupAfterHours * time.Hour)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err == nil && info.ModTime().Before(cutoff) {
			_ = os.RemoveAll(filepath.Join(root, entry.Name()))
		}
	}
}

func findRadiantExecutable() (string, error) {
	candidates := radiantExecutableCandidates()
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}

	for _, key := range []string{
		`HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\RadiAntViewer.exe`,
		`HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\RadiAntViewer.exe`,
		`HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\RadiAntViewer.exe`,
	} {
		out, err := exec.Command("reg.exe", "query", key, "/ve").Output()
		if err == nil {
			parts := strings.Fields(string(out))
			if len(parts) > 0 {
				candidate := strings.TrimSpace(strings.Join(parts[2:], " "))
				if info, statErr := os.Stat(candidate); statErr == nil && !info.IsDir() {
					return candidate, nil
				}
			}
		}
	}
	return "", errors.New("RadiAnt não encontrado")
}

func radiantExecutableCandidates() []string {
	roots := []string{
		os.Getenv("ProgramFiles"),
		os.Getenv("ProgramW6432"),
		os.Getenv("ProgramFiles(x86)"),
		os.Getenv("LOCALAPPDATA"),
	}
	directories := []string{"RadiAntViewer64bit", "RadiAntViewer", "RadiAnt DICOM Viewer"}
	unique := make(map[string]bool)
	candidates := make([]string, 0, len(roots)*len(directories))
	for _, root := range roots {
		if root == "" {
			continue
		}
		for _, directory := range directories {
			candidate := filepath.Join(root, directory, "RadiAntViewer.exe")
			if !unique[candidate] {
				unique[candidate] = true
				candidates = append(candidates, candidate)
			}
		}
	}
	return candidates
}

func showMessage(title, message string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")
	titleUTF16, _ := syscall.UTF16PtrFromString(title)
	messageUTF16, _ := syscall.UTF16PtrFromString(message)
	messageBox.Call(0, uintptr(unsafePointer(messageUTF16)), uintptr(unsafePointer(titleUTF16)), 0x40)
}

func unsafePointer(value *uint16) unsafe.Pointer { return unsafe.Pointer(value) }
