import { Modal, Text, TouchableOpacity, View, Image } from "react-native";
import * as Linking from "expo-linking";

type PopPreviewProps = {
  visible: boolean;
  item: any;
  onClose: () => void;
  onAck: () => void;
};

export function PopPreviewModal({ visible, item, onClose, onAck }: PopPreviewProps) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-4">
          <Text className="mb-2 text-lg font-black text-brand-primary">{item?.title}</Text>

          {item?.thumbnailUrl ? (
            <Image className="mb-2 h-44 w-full rounded-xl" source={{ uri: item.thumbnailUrl }} />
          ) : (
            <View className="mb-2 h-44 items-center justify-center rounded-xl bg-slate-100">
              <Text className="text-xs text-slate-500">Sem preview</Text>
            </View>
          )}

          <Text className="mb-3 text-xs text-slate-600">{item?.snippets?.[0]?.replace(/<[^>]+>/g, "") ?? ""}</Text>

          <View className="flex-row gap-2">
            <TouchableOpacity
              className="flex-1 rounded-xl bg-brand-primary p-3"
              onPress={() => {
                if (item?.pdfUrl) {
                  void Linking.openURL(item.pdfUrl);
                }
              }}
            >
              <Text className="text-center font-bold text-white">Abrir PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity className="rounded-xl border border-brand-primary px-3 py-3" onPress={onAck}>
              <Text className="font-bold text-brand-primary">Li e entendi</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity className="mt-3 rounded-xl bg-slate-100 p-3" onPress={onClose}>
            <Text className="text-center font-bold text-slate-700">Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
