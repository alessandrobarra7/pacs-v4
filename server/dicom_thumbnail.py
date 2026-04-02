#!/usr/bin/env python3
"""
Gera miniatura PNG 64x64 de um arquivo DICOM.
Uso: python3 dicom_thumbnail.py <caminho_dcm>
Saída: bytes PNG no stdout
"""
import sys
import io

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Uso: dicom_thumbnail.py <arquivo.dcm>\n")
        sys.exit(1)

    path = sys.argv[1]

    try:
        import pydicom
        import numpy as np
        from PIL import Image

        ds = pydicom.dcmread(path, stop_before_pixels=False)

        # Obter array de pixels
        arr = ds.pixel_array.astype(np.float32)

        # Se for multi-frame, pegar o frame do meio
        if arr.ndim == 3:
            mid = arr.shape[0] // 2
            arr = arr[mid]

        # Obter Window Center / Width para normalização
        wc = None
        ww = None
        try:
            wc_val = ds.WindowCenter
            ww_val = ds.WindowWidth
            # Pode ser DSfloat, lista ou string
            if hasattr(wc_val, '__iter__') and not isinstance(wc_val, str):
                wc = float(list(wc_val)[0])
                ww = float(list(ww_val)[0])
            else:
                wc = float(wc_val)
                ww = float(ww_val)
        except Exception:
            pass

        if wc is not None and ww is not None and ww > 0:
            w_min = wc - ww / 2
            w_max = wc + ww / 2
        else:
            w_min = float(arr.min())
            w_max = float(arr.max())

        rng = w_max - w_min if w_max != w_min else 1.0
        normalized = np.clip((arr - w_min) / rng * 255.0, 0, 255).astype(np.uint8)

        # MONOCHROME1: inverter (branco=0 → deve ser branco=255)
        photo = getattr(ds, 'PhotometricInterpretation', 'MONOCHROME2').strip()
        if photo == 'MONOCHROME1':
            normalized = 255 - normalized

        img = Image.fromarray(normalized, mode='L')
        img = img.resize((64, 64), Image.LANCZOS)
        img = img.convert('RGB')

        buf = io.BytesIO()
        img.save(buf, format='PNG', optimize=True)
        sys.stdout.buffer.write(buf.getvalue())

    except Exception as e:
        sys.stderr.write(f"Erro: {e}\n")
        sys.exit(2)

if __name__ == '__main__':
    main()
