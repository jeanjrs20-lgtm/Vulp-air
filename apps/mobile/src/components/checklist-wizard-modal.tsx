import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import SignatureScreen from "react-native-signature-canvas";
import { useMemo, useState } from "react";

type WizardProps = {
  visible: boolean;
  execution: any;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
  onSubmit: () => Promise<void>;
};

export function ChecklistWizardModal({ visible, execution, onClose, onSave, onSubmit }: WizardProps) {
  const [step, setStep] = useState(1);
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [techSignature, setTechSignature] = useState<string | null>(null);
  const [localSignature, setLocalSignature] = useState<string | null>(null);

  const sections = execution?.templateVersion?.sections ?? [];
  const itemMap = useMemo(() => {
    const map: Record<string, any> = {};

    for (const section of sections) {
      for (const item of section.items ?? []) {
        map[item.id] = item;
      }
    }

    return map;
  }, [sections]);

  const getSelectedSymptoms = (itemId: string) => {
    const value = answers[itemId];
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
  };

  const toggleSymptom = (itemId: string, option: string) => {
    setAnswers((prev) => {
      const currentValue = prev[itemId];
      const current = Array.isArray(currentValue)
        ? currentValue.filter((entry) => typeof entry === "string")
        : [];
      const exists = current.includes(option);
      const next = exists ? current.filter((entry) => entry !== option) : [...current, option];
      return {
        ...prev,
        [itemId]: next
      };
    });
  };

  const saveStep = async () => {
    const parsedAnswers = Object.entries(answers).map(([checklistItemId, value]) => {
      const itemType = itemMap[checklistItemId]?.itemType;

      if (itemType === "MULTIPLE_CHOICE" && Array.isArray(value)) {
        return {
          checklistItemId,
          valueJson: value
        };
      }

      if (itemType === "OK_NOK" && typeof value === "boolean") {
        return {
          checklistItemId,
          booleanValue: value,
          isNonConformity: value === false
        };
      }

      if (itemType === "NUMBER") {
        const parsedNumber =
          typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));

        if (Number.isFinite(parsedNumber)) {
          return {
            checklistItemId,
            numberValue: parsedNumber
          };
        }
      }

      if (value != null && typeof value === "object") {
        return {
          checklistItemId,
          valueJson: value
        };
      }

      return {
        checklistItemId,
        textValue: String(value)
      };
    });

    await onSave({
      step,
      notes,
      technicianSignature: techSignature ?? undefined,
      localResponsibleSignature: localSignature ?? undefined,
      answers: parsedAnswers
    });
  };

  return (
    <Modal animationType="slide" visible={visible}>
      <ScrollView className="flex-1 bg-brand-neutralBg px-4 pt-10">
        <Text className="text-xs font-bold text-brand-primary">Atendimento {execution?.code}</Text>
        <Text className="mb-4 text-2xl font-black text-brand-primary">Jornada (passo {step}/5)</Text>

        {step === 1 ? (
          <View className="rounded-2xl bg-white p-4">
            <Text className="mb-2 text-sm font-bold text-brand-primary">Dados do atendimento</Text>
            <Text className="text-sm">Cliente: {execution?.customer?.name ?? "-"}</Text>
            <Text className="text-sm">Unidade: {execution?.siteLocation?.name ?? "-"}</Text>
            <Text className="text-sm">Equipamento: {execution?.equipment?.model ?? "-"}</Text>
            <TextInput
              className="mt-3 rounded-xl border border-slate-300 p-3"
              multiline
              onChangeText={setNotes}
              placeholder="Observações"
              value={notes}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View className="space-y-3">
            {sections.map((section: any) => (
              <View className="mb-3 rounded-2xl bg-white p-4" key={section.id}>
                <Text className="mb-2 text-sm font-bold text-brand-primary">{section.title}</Text>
                {section.items.map((item: any) => (
                  <View className="mb-2" key={item.id}>
                    <Text className="text-xs font-semibold">{item.label}</Text>
                    {item.itemType === "OK_NOK" ? (
                      <View className="mt-1 flex-row gap-2">
                        <TouchableOpacity
                          className="rounded-lg bg-emerald-100 px-3 py-2"
                          onPress={() => setAnswers((prev) => ({ ...prev, [item.id]: true }))}
                        >
                          <Text>OK</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className="rounded-lg bg-red-100 px-3 py-2"
                          onPress={() => setAnswers((prev) => ({ ...prev, [item.id]: false }))}
                        >
                          <Text>NOK</Text>
                        </TouchableOpacity>
                      </View>
                    ) : item.itemType === "MULTIPLE_CHOICE" ? (
                      <View className="mt-1 gap-2">
                        {(item.options ?? []).map((option: string) => {
                          const selected = getSelectedSymptoms(item.id).includes(option);

                          return (
                            <TouchableOpacity
                              className={`rounded-lg border px-3 py-2 ${
                                selected ? "border-brand-primary bg-brand-primary/10" : "border-slate-300 bg-white"
                              }`}
                              key={option}
                              onPress={() => toggleSymptom(item.id, option)}
                            >
                              <Text className={selected ? "font-bold text-brand-primary" : "text-slate-700"}>
                                {selected ? "[x] " : "[ ] "}
                                {option}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <TextInput
                        className="mt-1 rounded-lg border border-slate-300 p-2"
                        onChangeText={(value) => setAnswers((prev) => ({ ...prev, [item.id]: value }))}
                        keyboardType={item.itemType === "NUMBER" ? "numeric" : "default"}
                        value={answers[item.id] ? String(answers[item.id]) : ""}
                      />
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {step === 3 ? (
          <View className="rounded-2xl bg-white p-4">
            <Text className="mb-2 text-sm font-bold text-brand-primary">Fotos/anexos</Text>
            <Text className="text-xs text-slate-600">Use o upload de mídia no fluxo web/API ou evolua com ImagePicker.</Text>
          </View>
        ) : null}

        {step === 4 ? (
          <View className="space-y-3">
            <View className="mb-3 h-56 overflow-hidden rounded-2xl bg-white p-2">
              <Text className="text-xs font-bold text-brand-primary">Assinatura do técnico</Text>
              <SignatureScreen
                autoClear
                descriptionText="Assine"
                onOK={(value) => setTechSignature(value)}
                webStyle=".m-signature-pad--footer{display:none;}"
              />
            </View>
            <View className="h-56 overflow-hidden rounded-2xl bg-white p-2">
              <Text className="text-xs font-bold text-brand-primary">Assinatura do responsável local</Text>
              <SignatureScreen
                autoClear
                descriptionText="Assine"
                onOK={(value) => setLocalSignature(value)}
                webStyle=".m-signature-pad--footer{display:none;}"
              />
            </View>
          </View>
        ) : null}

        {step === 5 ? (
          <View className="rounded-2xl bg-white p-4">
            <Text className="mb-2 text-sm font-bold text-brand-primary">Finalizar</Text>
            <Text className="text-sm text-slate-600">Revise os dados e envie para conferência do supervisor.</Text>
            <TouchableOpacity
              className="mt-3 rounded-xl bg-brand-primary p-3"
              onPress={async () => {
                await saveStep();
                await onSubmit();
                onClose();
              }}
            >
              <Text className="text-center font-bold text-white">Finalizar e enviar para revisão</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View className="my-4 flex-row justify-between">
          <TouchableOpacity
            className="rounded-xl border border-brand-primary px-4 py-3"
            disabled={step === 1}
            onPress={() => setStep((prev) => Math.max(1, prev - 1))}
          >
            <Text className="font-bold text-brand-primary">Voltar</Text>
          </TouchableOpacity>

          {step < 5 ? (
            <TouchableOpacity
              className="rounded-xl bg-brand-primary px-4 py-3"
              onPress={async () => {
                await saveStep();
                setStep((prev) => Math.min(5, prev + 1));
              }}
            >
              <Text className="font-bold text-white">Salvar e avançar</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity className="mb-8 rounded-xl bg-slate-200 p-3" onPress={onClose}>
          <Text className="text-center font-bold text-slate-700">Fechar</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}
