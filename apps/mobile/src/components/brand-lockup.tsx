import { Image, View } from "react-native";

export function BrandLockup() {
  return (
    <View className="items-start">
      <Image
        source={require("../../assets/branding/vulp-logo.png")}
        style={{ width: 182, height: 46, resizeMode: "contain" }}
      />
    </View>
  );
}
