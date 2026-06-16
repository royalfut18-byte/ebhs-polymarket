import PublicProfile from "@/components/PublicProfile";

export default function UserProfilePage({ params }: { params: { username: string } }) {
  return <PublicProfile username={params.username} />;
}
