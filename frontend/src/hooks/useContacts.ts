import { useCallback } from "react";
import { useAccount } from "wagmi";
import { usePersistedState } from "./usePersistedState";

export type Contact = {
  id: string;
  name: string;
  address: string;
  phone: string;
};

export type Profile = {
  displayName: string;
  contacts: Contact[];
};

const PROFILE_KEY_BASE = "anchor-remit:profile/v1";
const GUEST_KEY = `${PROFILE_KEY_BASE}:guest`;
const INITIAL: Profile = { displayName: "", contacts: [] };

function profileKey(address?: string) {
  return address ? `${PROFILE_KEY_BASE}:${address.toLowerCase()}` : GUEST_KEY;
}

export function useProfile() {
  const { address } = useAccount();
  const [profile, setProfile] = usePersistedState<Profile>(
    profileKey(address),
    INITIAL,
  );

  const setDisplayName = useCallback(
    (name: string) => setProfile((p) => ({ ...p, displayName: name })),
    [setProfile],
  );

  const addContact = useCallback(
    (c: Omit<Contact, "id">) =>
      setProfile((p) => ({
        ...p,
        contacts: [
          ...p.contacts,
          { ...c, id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()) },
        ],
      })),
    [setProfile],
  );

  const updateContact = useCallback(
    (id: string, patch: Partial<Omit<Contact, "id">>) =>
      setProfile((p) => ({
        ...p,
        contacts: p.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    [setProfile],
  );

  const removeContact = useCallback(
    (id: string) =>
      setProfile((p) => ({ ...p, contacts: p.contacts.filter((c) => c.id !== id) })),
    [setProfile],
  );

  return { profile, setDisplayName, addContact, updateContact, removeContact };
}
