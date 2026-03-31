import { eq } from "drizzle-orm";

import { db } from "@/db";
import { educatorProfiles, user } from "@/db/schema";

import type { UpsertEducatorProfileBody } from "./model";

const PROFILE_COLUMNS = {
  userId: educatorProfiles.userId,
  name: user.name,
  bio: educatorProfiles.bio,
  headline: educatorProfiles.headline,
  website: educatorProfiles.website,
  twitter: educatorProfiles.twitter,
  linkedin: educatorProfiles.linkedin,
  youtube: educatorProfiles.youtube,
  createdAt: educatorProfiles.createdAt,
  updatedAt: educatorProfiles.updatedAt,
};

export class EducatorProfileService {
  async getByUserId(userId: string) {
    const [row] = await db
      .select(PROFILE_COLUMNS)
      .from(educatorProfiles)
      .innerJoin(user, eq(educatorProfiles.userId, user.id))
      .where(eq(educatorProfiles.userId, userId));
    return row ?? null;
  }

  async upsert(userId: string, input: UpsertEducatorProfileBody) {
    const values = {
      bio: input.bio ?? null,
      headline: input.headline ?? null,
      website: input.website ?? null,
      twitter: input.twitter ?? null,
      linkedin: input.linkedin ?? null,
      youtube: input.youtube ?? null,
    };
    await db
      .insert(educatorProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: educatorProfiles.userId,
        set: { ...values, updatedAt: new Date() },
      });
    return this.getByUserId(userId);
  }
}

export const educatorProfileService = new EducatorProfileService();
