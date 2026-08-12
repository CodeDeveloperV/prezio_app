/**
 * Placeholder data for the dashboard scaffold. Replace with real queries
 * (frequent stores ranking, shopping list history) once those endpoints
 * exist on the backend.
 */

export interface MockStore {
  id: string;
  name: string;
  city: string;
}

export const mockFrequentStores: MockStore[] = [
  { id: 'store-rey', name: 'Rey', city: 'Ciudad de Panamá' },
  { id: 'store-romero', name: 'Romero', city: 'Ciudad de Panamá' },
  { id: 'store-super99', name: 'Super 99', city: 'Ciudad de Panamá' },
  { id: 'store-riba-smith', name: 'Riba Smith', city: 'Ciudad de Panamá' },
];

export interface MockShoppingList {
  id: string;
  name: string;
  itemCount: number;
  updatedAtLabel: string;
  totalEstimate: string;
}

export const mockRecentShoppingLists: MockShoppingList[] = [
  {
    id: 'list-1',
    name: 'Compra semanal',
    itemCount: 18,
    updatedAtLabel: 'Ayer',
    totalEstimate: 'B/. 84.50',
  },
  {
    id: 'list-2',
    name: 'Fin de semana',
    itemCount: 7,
    updatedAtLabel: 'Hace 3 días',
    totalEstimate: 'B/. 32.10',
  },
];
