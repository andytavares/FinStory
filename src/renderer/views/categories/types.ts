export interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isSystem: boolean;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
  readonly usageCount: number;
  readonly childCount: number;
  readonly needsReassignment: boolean;
  /** This month's spend in this category alone, positive minor units. */
  readonly spentMinor: number;
  /** This month's spend including subcategories. */
  readonly rolledUpSpentMinor: number;
}

/** What every row in the category list needs to act on the whole list. */
export interface CategoryScope {
  readonly allCategories: readonly CategoryRow[];
  readonly onChanged: () => void;
}

/** Inline rename: whether the name is an input now, and how to leave it. */
export interface RenameState {
  readonly editing: boolean;
  readonly onDone: () => void;
}
