import { useState } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { useProfile, Contact } from "../hooks/useContacts";

export default function Profile() {
  const { address } = useAccount();
  const { profile, setDisplayName, addContact, updateContact, removeContact } = useProfile();

  const [name, setName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setRecipientAddress("");
    setPhone("");
    setError(null);
    setEditingId(null);
  }

  function validate(): string | null {
    if (!name.trim()) return "Name is required";
    if (recipientAddress && !/^0x[0-9a-fA-F]{40}$/.test(recipientAddress.trim())) {
      return "Invalid wallet address";
    }
    if (!recipientAddress && !phone) {
      return "Provide a wallet address or phone";
    }
    return null;
  }

  function submit() {
    const err = validate();
    if (err) return setError(err);
    if (editingId) {
      updateContact(editingId, {
        name: name.trim(),
        address: recipientAddress.trim(),
        phone: phone.trim(),
      });
    } else {
      addContact({
        name: name.trim(),
        address: recipientAddress.trim(),
        phone: phone.trim(),
      });
    }
    resetForm();
  }

  function startEdit(c: Contact) {
    setEditingId(c.id);
    setName(c.name);
    setRecipientAddress(c.address);
    setPhone(c.phone);
    setError(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Profile</h1>
        <p className="text-white/60">
          Manage your display name and saved recipients. Contacts appear as a
          dropdown when sending a remittance.
        </p>
      </div>

      <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h2 className="font-semibold">Account</h2>
        <div>
          <label className="label">Display name</label>
          <input
            className="input"
            value={profile.displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Alice"
          />
        </div>
        <div>
          <label className="label">Wallet</label>
          <p className="font-mono text-sm text-white/70">
            {address ?? <span className="text-white/40">Not connected</span>}
          </p>
        </div>
      </motion.div>

      <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recipients</h2>
          <span className="text-xs text-white/50">{profile.contacts.length} saved</span>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bob"
            />
          </div>
          <div>
            <label className="label">Wallet address</label>
            <input
              className="input"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="0x…"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+14155550123"
            />
          </div>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          {editingId && (
            <button className="btn-ghost" onClick={resetForm}>
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
          <button className="btn-primary" onClick={submit}>
            {editingId ? (
              <>
                <Check className="w-3 h-3" /> Save
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" /> Add recipient
              </>
            )}
          </button>
        </div>

        {profile.contacts.length === 0 ? (
          <p className="text-white/50 text-sm">No saved recipients yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {profile.contacts.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-white/60 truncate">
                    {c.address && (
                      <span className="font-mono">
                        {c.address.slice(0, 6)}…{c.address.slice(-4)}
                      </span>
                    )}
                    {c.address && c.phone && <span> · </span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    className="btn-ghost text-xs py-1 px-2"
                    onClick={() => startEdit(c)}
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button
                    className="btn-ghost text-xs py-1 px-2 text-danger"
                    onClick={() => removeContact(c.id)}
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
