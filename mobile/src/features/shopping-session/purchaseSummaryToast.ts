import Toast from 'react-native-toast-message';

export function showPurchaseSummaryError(message: string) {
  Toast.show({
    type: 'error',
    position: 'top',
    topOffset: 56,
    visibilityTime: 3500,
    text1: 'No pudimos actualizar tu compra',
    text2: message,
  });
}
