export type SectionMarkup = string;
export type TabStates = Record<string, SectionMarkup>;
export type OpenDialog = (kind: 'sales' | 'subscribe' | 'search') => void;
