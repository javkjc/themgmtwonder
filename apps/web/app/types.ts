export type Me = {
  userId: string;
  email: string;
  mustChangePassword: boolean;
  role: string;
  isAdmin: boolean;
};

export type Todo = {
  id: string;
  userId: string;
  title: string;
  done: boolean;
  createdAt: string;
  startAt?: string | null;
  durationMin?: number | null;
  category?: string | null;
  stageKey?: string | null;
  isPinned?: boolean;
  parentId?: string | null;
  childCount?: number;
};
