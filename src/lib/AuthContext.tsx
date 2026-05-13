import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'mod' | 'viewer' | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'mod' | 'viewer' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeRole: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Create user doc if not exists
        const userRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              displayName: user.displayName || 'User',
              email: user.email,
              photoURL: user.photoURL,
              role: 'viewer', // Default role
              createdAt: serverTimestamp()
            });
          }
        } catch (error) {
          console.error("Error syncing user profile:", error);
        }

        unsubscribeRole = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setRole(doc.data().role || 'viewer');
          } else {
            setRole('viewer');
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching role:", error);
          setRole('viewer');
          setLoading(false);
        });
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeRole) unsubscribeRole();
    };
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
