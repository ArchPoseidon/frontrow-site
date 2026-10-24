import { redirect } from "next/navigation";

// Settings now live on the profile.
export default function Settings() {
  redirect("/profile");
}
