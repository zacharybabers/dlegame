import { notFound } from "next/navigation";
import EditorApp from "@/components/editor/EditorApp";

/**
 * Dev-only entry editor at /editor. In production this returns 404 (the route
 * and its API sibling are never usable on the live site). Locally it's a GUI
 * over the same sync engine the CLI uses.
 */
export const dynamic = "force-dynamic";

export default function EditorPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EditorApp />;
}
