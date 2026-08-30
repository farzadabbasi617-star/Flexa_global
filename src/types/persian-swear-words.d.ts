declare module "persian-swear-words" {
  interface PersianSwearFilter {
    isBad(text: string): boolean;
    hasSwear(text: string): boolean;
    filterWords(text: string, symbol?: string): string;
  }

  const PersianSwear: PersianSwearFilter;
  export default PersianSwear;
}
