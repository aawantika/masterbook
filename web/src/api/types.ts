export type SourceType = 'epub' | 'instagram' | 'website' | 'manual';

export type ParsedIngredientLine = {
  rawText: string;
  quantity: string | null;
  unit: string | null;
  name: string;
  section: string | null;
};

export type ParsedInstructionStep = {
  text: string;
  section: string | null;
};

export type RecipeDraft = {
  title: string;
  ingredients: ParsedIngredientLine[];
  instructions: ParsedInstructionStep[];
  rawText: string;
  servings?: string | null;
  totalTimeMinutes?: number | null;
  cuisineNames?: string[];
  imageUrl?: string | null;
  sourceName?: string | null;
  sourceRef?: string | null;
};

export type RecipeInput = {
  title: string;
  servings?: string | null;
  totalTimeMinutes?: number | null;
  instructions: ParsedInstructionStep[];
  ingredients: ParsedIngredientLine[];
  rawText: string;
  sourceType: SourceType;
  sourceRef?: string | null;
  sourceName?: string | null;
  videoRef?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  mealTypeIds: number[];
  cuisineNames: string[];
};

export type RecipeSummary = {
  id: number;
  title: string;
  sourceType: string;
  sourceRef: string | null;
  sourceName: string | null;
  imageUrl: string | null;
  wantToTryAt: string | null;
  favoritedAt: string | null;
  needsFixingAt: string | null;
  avgRating: number | null;
  lastCookedAt: string | null;
  mealTypes: string[];
  cuisines: string[];
  ownerId: number | null;
  ownerName: string | null;
};

export type RecipeAttempt = {
  id: number;
  attemptedAt: string;
  rating: number | null;
  notes: string | null;
};

export type ActivityEntry = {
  id: number;
  recipeId: number;
  recipeTitle: string;
  attemptedAt: string;
  rating: number | null;
  notes: string | null;
  userName: string | null;
};

export type RecipeDetail = {
  id: number;
  title: string;
  servings: string | null;
  totalTimeMinutes: number | null;
  instructions: ParsedInstructionStep[];
  ingredients: ParsedIngredientLine[];
  rawText: string;
  sourceType: string;
  sourceRef: string | null;
  sourceName: string | null;
  videoRef: string | null;
  imageUrl: string | null;
  notes: string | null;
  wantToTryAt: string | null;
  favoritedAt: string | null;
  needsFixingAt: string | null;
  mealTypeIds: number[];
  cuisineNames: string[];
  attempts: RecipeAttempt[];
  ownerId: number | null;
  ownerName: string | null;
};

export type MetaItem = { id: number; name: string };

// The "who's in this group" list for the browse page's "Added by" filter --
// GET /api/meta/contributors, visible to any approved member, not just
// admins (unlike User/GET /auth/users below).
export type Contributor = { id: number; name: string };

export type User = {
  id: number;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'admin' | 'user';
  approvedAt: string | null;
  createdAt: string;
  // Only present on the admin user listing (GET /auth/users) -- Firebase's
  // live flag for whether the account has proven it owns this email.
  emailVerified?: boolean;
};

export type SiteStatus = {
  frozenAt: string | null;
  frozenBy: number | null;
  frozenMessage: string | null;
};

export type UserRecipeCount = {
  userId: number | null;
  name: string;
  recipeCount: number;
};

export type SiteStats = {
  totalRecipes: number;
  totalUsers: number;
  perUser: UserRecipeCount[];
  storage: {
    databaseBytes: number;
    imagesBytes: number;
    epubSourcesBytes: number;
    totalBytes: number;
  };
};

export type DuplicateMatch = { id: number; title: string; sourceName: string | null };

export type EpubSource = {
  id: number;
  title: string | null;
  author: string | null;
  filename: string | null;
  importedAt: string;
  recipeCount: number;
};

export type EpubChapterSummary = {
  flowIndex: number;
  title: string;
};

export type EpubSourceDetail = EpubSource & {
  chapters: EpubChapterSummary[];
};

export type EpubBlock = {
  index: number;
  tag: string;
  text: string;
};

export type EpubBookmark = {
  id: number;
  epubSourceId: number;
  title: string | null;
  startFlowIndex: number;
  startBlockIndex: number;
  endFlowIndex: number;
  endBlockIndex: number;
  createdAt: string;
};
