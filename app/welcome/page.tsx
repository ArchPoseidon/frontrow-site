import { redirect } from "next/navigation";

// The blocking "searching" page is gone: the first scan runs in the background and the radar shows progress.
export default function Welcome() {
  redirect("/radar?welcome=1");
}
