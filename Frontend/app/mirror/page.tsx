import { SiteHeader } from "@/components/site-header"
import { MirrorChat } from "@/components/mirror-chat"

export default function MirrorPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <MirrorChat />
      </main>
    </>
  )
}
