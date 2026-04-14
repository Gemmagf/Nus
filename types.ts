
export enum AppView {
  VETERINARIAN = 'VETERINARIAN',
  OWNER = 'OWNER'
}

export interface ActivityData {
  day: string;
  activity: number;
  symmetry: number;
  painLevel: number;
}

export interface SlideProps {
  onNext: () => void;
  onPrev: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}
