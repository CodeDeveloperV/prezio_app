import Toast from 'react-native-toast-message';

type ScanToastInput = {
  title: string;
  message: string;
};

export function showScanErrorToast({ title, message }: ScanToastInput) {
  Toast.show({
    type: 'error',
    position: 'top',
    topOffset: 56,
    visibilityTime: 3500,
    text1: title,
    text2: message,
  });
}
