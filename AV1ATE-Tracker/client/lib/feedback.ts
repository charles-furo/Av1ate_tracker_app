import * as MailComposer from "expo-mail-composer";
import * as Clipboard from "expo-clipboard";
import * as Application from "expo-application";
import { Platform, Alert } from "react-native";

export const FEEDBACK_EMAIL = "feedback@av1ate.app";

export async function getDeviceInfo(): Promise<string> {
  const appVersion = Application.nativeApplicationVersion || "dev";
  const buildNumber = Application.nativeBuildVersion || "dev";
  const osName = Platform.OS;
  const osVersion = Platform.Version;

  return `App version: ${appVersion} (${buildNumber})
Device/OS: ${osName} ${osVersion}`;
}

export async function openFeedback(): Promise<void> {
  const deviceInfo = await getDeviceInfo();

  const body = `What I was trying to do:


What I expected:


What happened:


Feature request:


Aircraft:


${deviceInfo}`;

  const isAvailable = await MailComposer.isAvailableAsync();

  if (isAvailable) {
    await MailComposer.composeAsync({
      recipients: [FEEDBACK_EMAIL],
      subject: "AV1ATE Tracker Feedback",
      body,
    });
  } else {
    Alert.alert(
      "Email Not Available",
      `Please send your feedback to:\n\n${FEEDBACK_EMAIL}`,
      [
        {
          text: "Copy Email",
          onPress: async () => {
            await Clipboard.setStringAsync(FEEDBACK_EMAIL);
            Alert.alert("Copied", "Email address copied to clipboard");
          },
        },
        { text: "OK" },
      ]
    );
  }
}
