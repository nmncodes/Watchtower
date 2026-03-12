import { redirect } from "next/navigation";

export default function DemoEntryPage() {
  redirect("/api/demo/access?next=/demo/workspace");
}
