import PublicProfile from "@/components/PublicProfile";

type UserProfilePageParams = { username: string };

export default async function UserProfilePage({
  params,
}: {
  params: Promise<UserProfilePageParams> | UserProfilePageParams;
}) {
  const { username } = await Promise.resolve(params);
  return <PublicProfile username={decodeURIComponent(username ?? "")} />;
}
