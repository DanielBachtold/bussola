'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { setSetting } from '@/lib/budget';

export async function dismissOnboarding() {
  await requireSession();
  await setSetting('onboarding_dismissed', '1');
  revalidatePath('/');
}
