import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

interface AnamnesisModalProps {
  open: boolean;
  onClose: () => void;
  studyInstanceUid: string;
  onSave: (data: AnamnesisData) => void;
}

export interface AnamnesisData {
  // CAMADA 1
  examArea?: string;
  // CAMADA 2
  mainSymptom?: string;
  // CAMADA 3
  symptomDurationDays?: number;
  symptomIntensity?: string;
  // CAMADA 4
  hasFever?: boolean;
  feverTemperature?: number;
  hasDyspnea?: boolean;
  hasChestPain?: boolean;
  // CAMADA 5
  hasHypertension?: boolean;
  hasDiabetes?: boolean;
  hasAnxiety?: boolean;
  hasPreviousLungDisease?: boolean;
  usesContinuousMedication?: boolean;
  medicationsList?: string;
  // CAMADA 6
  examPurpose?: string;
  // CID sugerido
  suggestedCid?: string;
  suggestedCidDescription?: string;
}

export function AnamnesisModal({ open, onClose, studyInstanceUid, onSave }: AnamnesisModalProps) {
  const [currentLayer, setCurrentLayer] = useState(1);
  const [data, setData] = useState<AnamnesisData>({});

  const examAreas = ["Tórax", "Abdome", "Coluna", "Crânio", "Membros"];
  
  const thoraxSymptoms = ["Tosse", "Dor torácica", "Falta de ar", "Febre", "Nenhum"];
  const abdomenSymptoms = ["Dor abdominal", "Náusea", "Vômito", "Diarreia", "Nenhum"];
  const spineSymptoms = ["Dor lombar", "Dor cervical", "Trauma recente", "Nenhum"];
  const craniumSymptoms = ["Cefaleia", "Tontura", "Trauma", "Nenhum"];
  const limbsSymptoms = ["Dor", "Edema", "Trauma", "Nenhum"];

  const getSymptoms = () => {
    switch (data.examArea) {
      case "Tórax": return thoraxSymptoms;
      case "Abdome": return abdomenSymptoms;
      case "Coluna": return spineSymptoms;
      case "Crânio": return craniumSymptoms;
      case "Membros": return limbsSymptoms;
      default: return thoraxSymptoms;
    }
  };

  const calculateCID = () => {
    // Lógica simplificada de sugestão de CID
    if (data.examArea === "Tórax") {
      if (data.mainSymptom === "Tosse") {
        if (data.symptomDurationDays && data.symptomDurationDays <= 3) {
          return { cid: "J00-J06.9", description: "Infecção respiratória aguda" };
        } else if (data.symptomDurationDays && data.symptomDurationDays > 14) {
          return { cid: "R05.9", description: "Tosse crônica" };
        } else if (data.hasFever) {
          return { cid: "J06.9", description: "Infecção respiratória" };
        }
      } else if (data.mainSymptom === "Falta de ar") {
        return { cid: "J45", description: "Asma ou investigação pulmonar" };
      }
    } else if (data.examArea === "Abdome") {
      if (data.mainSymptom === "Dor abdominal") {
        return { cid: "R10.9", description: "Dor abdominal não especificada" };
      } else if (data.mainSymptom === "Náusea" || data.mainSymptom === "Vômito") {
        return { cid: "K29", description: "Gastrite" };
      }
    } else if (data.examArea === "Coluna") {
      if (data.mainSymptom === "Dor lombar") {
        return { cid: "M54.5", description: "Dor lombar" };
      }
    } else if (data.examArea === "Crânio") {
      if (data.mainSymptom === "Cefaleia") {
        return { cid: "G43.909", description: "Enxaqueca" };
      } else if (data.mainSymptom === "Tontura") {
        return { cid: "R51", description: "Cefaleia" };
      }
    }

    if (data.examPurpose === "preventivo") {
      return { cid: "Z00.00", description: "Exame preventivo" };
    }

    return { cid: "R69", description: "Sintomas não especificados" };
  };

  const handleNext = () => {
    if (currentLayer < 6) {
      setCurrentLayer(currentLayer + 1);
    }
  };

  const handleBack = () => {
    if (currentLayer > 1) {
      setCurrentLayer(currentLayer - 1);
    }
  };

  const handleFinish = () => {
    const cidResult = calculateCID();
    const finalData = {
      ...data,
      suggestedCid: cidResult.cid,
      suggestedCidDescription: cidResult.description,
    };
    onSave(finalData);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>CID - Indicações (Anamnese)</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Camada {currentLayer} de 6
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* CAMADA 1: Área do exame */}
          {currentLayer === 1 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">
                Qual região está relacionada ao exame?
              </Label>
              <RadioGroup
                value={data.examArea}
                onValueChange={(value) => setData({ ...data, examArea: value })}
              >
                {examAreas.map((area) => (
                  <div key={area} className="flex items-center space-x-2">
                    <RadioGroupItem value={area} id={`area-${area}`} />
                    <Label htmlFor={`area-${area}`} className="cursor-pointer">
                      {area}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* CAMADA 2: Sintoma principal */}
          {currentLayer === 2 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">
                O paciente apresenta algum dos seguintes sintomas?
              </Label>
              <RadioGroup
                value={data.mainSymptom}
                onValueChange={(value) => setData({ ...data, mainSymptom: value })}
              >
                {getSymptoms().map((symptom) => (
                  <div key={symptom} className="flex items-center space-x-2">
                    <RadioGroupItem value={symptom} id={`symptom-${symptom}`} />
                    <Label htmlFor={`symptom-${symptom}`} className="cursor-pointer">
                      {symptom}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* CAMADA 3: Caracterização do sintoma */}
          {currentLayer === 3 && data.mainSymptom && data.mainSymptom !== "Nenhum" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="duration" className="text-base font-semibold">
                  Há quantos dias iniciou o sintoma?
                </Label>
                <Input
                  id="duration"
                  type="number"
                  min="0"
                  placeholder="Número de dias"
                  value={data.symptomDurationDays || ""}
                  onChange={(e) =>
                    setData({ ...data, symptomDurationDays: parseInt(e.target.value) || undefined })
                  }
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  0-3 dias: agudo inicial | 4-14 dias: infecção provável | &gt;14 dias: crônico
                </p>
              </div>

              <div>
                <Label className="text-base font-semibold">Intensidade do sintoma</Label>
                <RadioGroup
                  value={data.symptomIntensity}
                  onValueChange={(value) => setData({ ...data, symptomIntensity: value })}
                  className="mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="leve" id="intensity-leve" />
                    <Label htmlFor="intensity-leve" className="cursor-pointer">Leve</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="moderada" id="intensity-moderada" />
                    <Label htmlFor="intensity-moderada" className="cursor-pointer">Moderada</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="intensa" id="intensity-intensa" />
                    <Label htmlFor="intensity-intensa" className="cursor-pointer">Intensa</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          {currentLayer === 3 && data.mainSymptom === "Nenhum" && (
            <div className="text-center text-muted-foreground py-8">
              Nenhum sintoma relatado. Prossiga para a próxima etapa.
            </div>
          )}

          {/* CAMADA 4: Sintomas associados */}
          {currentLayer === 4 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Sintomas associados</Label>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="fever"
                    checked={data.hasFever}
                    onCheckedChange={(checked) => setData({ ...data, hasFever: checked as boolean })}
                  />
                  <Label htmlFor="fever" className="cursor-pointer">Febre</Label>
                </div>

                {data.hasFever && (
                  <div className="ml-6">
                    <Label htmlFor="temperature">Temperatura aproximada (°C)</Label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      min="35"
                      max="42"
                      placeholder="Ex: 38.5"
                      value={data.feverTemperature || ""}
                      onChange={(e) =>
                        setData({ ...data, feverTemperature: parseFloat(e.target.value) || undefined })
                      }
                      className="mt-1"
                    />
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dyspnea"
                    checked={data.hasDyspnea}
                    onCheckedChange={(checked) => setData({ ...data, hasDyspnea: checked as boolean })}
                  />
                  <Label htmlFor="dyspnea" className="cursor-pointer">Falta de ar</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="chestPain"
                    checked={data.hasChestPain}
                    onCheckedChange={(checked) => setData({ ...data, hasChestPain: checked as boolean })}
                  />
                  <Label htmlFor="chestPain" className="cursor-pointer">Dor ao respirar</Label>
                </div>
              </div>
            </div>
          )}

          {/* CAMADA 5: Histórico clínico */}
          {currentLayer === 5 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">
                O paciente possui alguma dessas condições?
              </Label>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hypertension"
                    checked={data.hasHypertension}
                    onCheckedChange={(checked) => setData({ ...data, hasHypertension: checked as boolean })}
                  />
                  <Label htmlFor="hypertension" className="cursor-pointer">Hipertensão (I10)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="diabetes"
                    checked={data.hasDiabetes}
                    onCheckedChange={(checked) => setData({ ...data, hasDiabetes: checked as boolean })}
                  />
                  <Label htmlFor="diabetes" className="cursor-pointer">Diabetes (E11.9)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="anxiety"
                    checked={data.hasAnxiety}
                    onCheckedChange={(checked) => setData({ ...data, hasAnxiety: checked as boolean })}
                  />
                  <Label htmlFor="anxiety" className="cursor-pointer">Ansiedade (F41.1)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="lungDisease"
                    checked={data.hasPreviousLungDisease}
                    onCheckedChange={(checked) => setData({ ...data, hasPreviousLungDisease: checked as boolean })}
                  />
                  <Label htmlFor="lungDisease" className="cursor-pointer">Doença pulmonar prévia</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="medication"
                    checked={data.usesContinuousMedication}
                    onCheckedChange={(checked) => setData({ ...data, usesContinuousMedication: checked as boolean })}
                  />
                  <Label htmlFor="medication" className="cursor-pointer">Utiliza medicação contínua</Label>
                </div>

                {data.usesContinuousMedication && (
                  <div className="ml-6">
                    <Label htmlFor="medicationsList">Quais medicações?</Label>
                    <Input
                      id="medicationsList"
                      placeholder="Ex: Losartana, Metformina..."
                      value={data.medicationsList || ""}
                      onChange={(e) => setData({ ...data, medicationsList: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CAMADA 6: Finalidade do exame */}
          {currentLayer === 6 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">
                O exame é preventivo ou por sintomas?
              </Label>
              <RadioGroup
                value={data.examPurpose}
                onValueChange={(value) => setData({ ...data, examPurpose: value })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="preventivo" id="purpose-preventivo" />
                  <Label htmlFor="purpose-preventivo" className="cursor-pointer">
                    Preventivo (Z00.00)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sintomas" id="purpose-sintomas" />
                  <Label htmlFor="purpose-sintomas" className="cursor-pointer">
                    Por sintomas
                  </Label>
                </div>
              </RadioGroup>

              {data.examPurpose && (
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">CID Sugerido:</h4>
                  <p className="text-sm">
                    <strong>{calculateCID().cid}</strong> - {calculateCID().description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Sugestão apenas informativa para organização do estudo DICOM.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentLayer === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>

          {currentLayer < 6 ? (
            <Button onClick={handleNext}>
              Próximo
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleFinish} className="bg-green-600 hover:bg-green-700">
              <Check className="w-4 h-4 mr-2" />
              Finalizar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
