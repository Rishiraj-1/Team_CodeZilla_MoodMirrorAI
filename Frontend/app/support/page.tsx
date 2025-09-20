"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SiteHeader } from "@/components/site-header"
import { addSupportContact, getSupportContacts, deleteSupportContact } from "@/utils/api"

type Contact = { name: string; phone: string; created_at?: string; id?: string }

export default function SupportPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const data = await getSupportContacts()
        const arr = Array.isArray(data)
          ? data
          : Object.entries(data || {}).map(([id, v]: any) => ({ id, ...(v as any) }))
        setContacts(arr)
      } catch (e: any) {
        setError("Could not load contacts. Are you signed in?")
        setContacts([])
      }
    })()
  }, [])

  async function onAdd() {
    if (!name.trim() || !phone.trim()) return
    try {
      const res = await addSupportContact(name.trim(), phone.trim())
      setContacts((prev) => ([{ id: res?.id, name: name.trim(), phone: phone.trim() }, ...(prev || [])]))
      setName("")
      setPhone("")
    } catch (e) {
      setError("Failed to add contact")
    }
  }

  async function onRemove(contactId: string) {
    try {
      await deleteSupportContact(contactId)
      setContacts((prev) => prev?.filter(c => c.id !== contactId) || [])
    } catch (e) {
      setError("Failed to remove contact")
    }
  }
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8">
        <section aria-labelledby="support-heading">
          <Card>
            <CardHeader>
              <CardTitle id="support-heading" className="text-pretty">
                Support Network
              </CardTitle>
              <CardDescription className="text-pretty">
                Activate your support circle and view a helpful message tailored for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <Button className="min-w-40" aria-label="Activate Support">
                  Activate Support
                </Button>
                <p className="text-sm text-muted-foreground">Sends a wellbeing check-in to your trusted contacts.</p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  AI Support Message (placeholder): Remember to breathe deeply. A 5-minute walk, a glass of water, or a
                  brief chat with someone you trust can help reset your day.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">Trusted Contacts</h3>
                {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}

                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                  <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="sm:w-60" />
                  <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="sm:w-60" />
                  <Button onClick={onAdd}>Add</Button>
                </div>

                {contacts === null ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Loading…</div>
                ) : contacts.length === 0 ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">No contacts yet.</div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {contacts.map((c) => (
                      <li key={(c as any).id || c.phone} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-sm text-muted-foreground">{c.phone}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" aria-label={`Contact ${c.name}`}>
                              Contact
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => onRemove(c.id!)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              aria-label={`Remove ${c.name}`}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  )
}
