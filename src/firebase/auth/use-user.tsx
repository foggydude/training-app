'use client';

import { useState } from 'react';
import type { User } from '@/lib/types';
import { useRouter } from 'next/navigation';

// Mock user data since login is disabled.
const mockUser: User = {
  id: 'mock-user-id',
  displayName: 'Demo User',
  email: 'demo@example.com',
  photoURL: null,
  createdAt: Date.now(),
};

/**
 * A mock version of the useUser hook that returns a static user object.
 * This effectively disables authentication and allows access to the app
 * as if a user were logged in.
 */
export function useUser() {
  const router = useRouter();
  const [user] = useState<User | null>(mockUser);
  const [loading] = useState(false);

  const signOut = async () => {
    // In a real app, this would sign the user out.
    // For now, it does nothing as login is disabled.
    console.log('Sign out clicked');
  };

  const signInWithEmail = async (email: string, password: string) => {
    // This function is no longer used but is kept to avoid breaking imports.
    console.log('Sign in attempt with:', email);
  };

  return { user, loading, signOut, signInWithEmail };
}
