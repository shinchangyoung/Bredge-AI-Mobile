export const FontFamily = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semiBold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  extraBold: 'Pretendard-ExtraBold',
  black: 'Pretendard-Black',
} as const;

export const defaultTextStyle = {
  fontFamily: FontFamily.regular,
  letterSpacing: 0,
} as const;
