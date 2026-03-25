// ===== Enums =====

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum LookingFor {
  NETWORKING = 'NETWORKING',
  FRIENDSHIP = 'FRIENDSHIP',
  RELATIONSHIP = 'RELATIONSHIP',
}

export enum Language {
  UZBEK = 'UZBEK',
  RUSSIAN = 'RUSSIAN',
  ENGLISH = 'ENGLISH',
}

export enum InterestCategory {
  TECH = 'TECH',
  BUSINESS = 'BUSINESS',
  CREATIVE = 'CREATIVE',
  SPORTS = 'SPORTS',
  LIFESTYLE = 'LIFESTYLE',
  ACADEMIC = 'ACADEMIC',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

export enum IntroStatus {
  PENDING = 'PENDING',
  ANSWERED = 'ANSWERED',
  MATCHED = 'MATCHED',
  EXPIRED = 'EXPIRED',
}

export enum ReportReason {
  FAKE_PROFILE = 'FAKE_PROFILE',
  HARASSMENT = 'HARASSMENT',
  SPAM = 'SPAM',
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  OTHER = 'OTHER',
}

export enum ReportStatus {
  PENDING = 'PENDING',
  REVIEWED = 'REVIEWED',
  ACTIONED = 'ACTIONED',
  DISMISSED = 'DISMISSED',
}

// ===== User Types =====

export interface UserProfile {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  gender: Gender;
  lookingFor: LookingFor[];
  birthDate: string;
  city: string;
  bio: string | null;
  currentRole: string | null;
  university: string | null;
  workplace: string | null;
  photos: Photo[];
  interests: InterestWithCategory[];
  languages: Language[];
  eloScore: number;
  profileComplete: boolean;
  verified: boolean;
  isPremium: boolean;
  status: UserStatus;
  lastActiveAt: string;
  createdAt: string;
}

export interface PublicProfile {
  id: string;
  firstName: string;
  lastName: string | null;
  gender: Gender;
  lookingFor: LookingFor[];
  age: number;
  city: string;
  bio: string | null;
  currentRole: string | null;
  university: string | null;
  photos: Photo[];
  interests: InterestWithCategory[];
  verified: boolean;
  isPremium: boolean;
  sharedInterests?: InterestWithCategory[];
  compatibilityScore?: number;
}

export interface Photo {
  id: string;
  url: string;
  position: number;
  verified: boolean;
}

export interface Interest {
  id: string;
  name: string;
  nameUz: string;
  nameRu: string;
  category: InterestCategory;
  icon: string | null;
}

export interface InterestWithCategory extends Interest {
  category: InterestCategory;
}

// ===== Intro Types =====

export interface IntroData {
  id: string;
  senderId: string;
  receiverId: string;
  question: string;
  senderAnswer: string | null;
  receiverAnswer: string | null;
  status: IntroStatus;
  chatUnlocked: boolean;
  expiresAt: string;
  createdAt: string;
  sender?: PublicProfile;
  receiver?: PublicProfile;
}

// ===== Daily Batch =====

export interface DailyBatchData {
  id: string;
  profiles: PublicProfile[];
  date: string;
  remaining: number;
  total: number;
}

// ===== Report =====

export interface ReportData {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
}

// ===== API Response =====

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
  isNewUser: boolean;
  onboardingComplete: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ===== Onboarding =====

export interface OnboardingData {
  gender: Gender;
  lookingFor: LookingFor[];
  city: string;
  birthDate: string;
  currentRole: string;
  university?: string;
  workplace?: string;
  interestIds: string[];
  bio?: string;
  languages: Language[];
}

// ===== Matching =====

export interface MatchScore {
  userId: string;
  score: number;
  breakdown: {
    interestOverlap: number;
    professionMatch: number;
    activityScore: number;
    eloProximity: number;
    profileQuality: number;
  };
}

// ===== ELO Events =====

export enum EloEvent {
  INTRO_RECEIVED = 'INTRO_RECEIVED',
  MATCH_CREATED = 'MATCH_CREATED',
  PROFILE_VERIFIED = 'PROFILE_VERIFIED',
  PROFILE_COMPLETE = 'PROFILE_COMPLETE',
  DAILY_ACTIVE = 'DAILY_ACTIVE',
  INTRO_EXPIRED = 'INTRO_EXPIRED',
  REPORTED = 'REPORTED',
  INACTIVE_DECAY = 'INACTIVE_DECAY',
  INTRO_DECLINED = 'INTRO_DECLINED',
}

// ===== Notification =====

export enum NotificationType {
  DAILY_BATCH = 'DAILY_BATCH',
  NEW_INTRO = 'NEW_INTRO',
  MATCH = 'MATCH',
  EXPIRY_WARNING = 'EXPIRY_WARNING',
  WEEKLY_SPARK = 'WEEKLY_SPARK',
  RE_ENGAGEMENT = 'RE_ENGAGEMENT',
  PROFILE_TIP = 'PROFILE_TIP',
}
