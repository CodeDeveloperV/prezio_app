import Toast from 'react-native-toast-message';

type AuthToastInput = {
  title: string;
  message: string;
};

export function showAuthErrorToast({ title, message }: AuthToastInput) {
  Toast.show({
    type: 'error',
    position: 'top',
    topOffset: 56,
    visibilityTime: 3500,
    text1: title,
    text2: message,
  });
}
