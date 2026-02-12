import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPress={(ev) => {
        if (process.env.EXPO_OS === "ios") {
          // Soft haptic when tab actually changes
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        props.onPress?.(ev);
      }}
    />
  );
}
