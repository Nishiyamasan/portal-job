'use client';

import {useEffect, useState} from 'react';
import {getMyOwnerApplications} from '@/lib/api';
import {useAuth} from '@/lib/auth';

const cachedByUserId: Record<string, boolean> = {};
const inflightByUserId: Record<string, Promise<boolean>> = {};

async function fetchOwnerAccess(userId: string): Promise<boolean> {
  if (typeof cachedByUserId[userId] === 'boolean') {
    return cachedByUserId[userId];
  }

  if (!inflightByUserId[userId]) {
    inflightByUserId[userId] = getMyOwnerApplications()
      .then((applications) => applications.some((application) => application.status === 'approved'))
      .catch(() => false)
      .then((result) => {
        cachedByUserId[userId] = result;
        return result;
      })
      .finally(() => {
        delete inflightByUserId[userId];
      });
  }

  return inflightByUserId[userId];
}

export function useOwnerAccess() {
  const {user, isLoading} = useAuth();
  const [hasOwnerAccess, setHasOwnerAccess] = useState(false);
  const [isCheckingOwnerAccess, setIsCheckingOwnerAccess] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      setHasOwnerAccess(false);
      return;
    }

    let mounted = true;
    setIsCheckingOwnerAccess(true);
    fetchOwnerAccess(user.id)
      .then((result) => {
        if (mounted) {
          setHasOwnerAccess(result);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsCheckingOwnerAccess(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isLoading, user]);

  return {hasOwnerAccess, isCheckingOwnerAccess};
}
