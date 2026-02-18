export type MinistryLite = {
  id: string;
  name: string | null;
  avatar_url: string | null;
};

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  cover_image: string | null;
  lat?: number | null;
  lng?: number | null;
  owner_id?: string | null;
  event_categories?: any[] | null;
  categories: string[];

  ministry_id?: string | null;
  ministries?: MinistryLite | null;
};

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
