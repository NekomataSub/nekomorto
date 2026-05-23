import PublicUserProfileCard from "@/components/PublicUserProfileCard";
import { publicPageLayoutTokens } from "@/components/public-page-tokens";
import { normalizeUploadVariantUrlKey, type UploadMediaVariantsMap } from "@/lib/upload-variants";
import type { TeamPageConfig } from "@/types/public-pages";
import type { PublicTeamLinkType, PublicTeamMember } from "@/types/public-team";
import type { SiteSettings } from "@/types/site-settings";

const TEAM_AVATAR_IMAGE_SIZES = "(max-width: 639px) 224px, (max-width: 767px) 240px, 256px";

export interface PublicTeamPageContentProps {
  isLoading?: boolean;
  linkTypes: PublicTeamLinkType[];
  mediaVariants: UploadMediaVariantsMap;
  members: PublicTeamMember[];
  pageCopy: TeamPageConfig;
  siteSettings?: SiteSettings | null;
}

const normalizeStatus = (status?: string | null) =>
  String(status || "")
    .trim()
    .toLowerCase();

const sortMembersByOrder = (members: PublicTeamMember[]) =>
  [...members].sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0));

const getMemberImageSrc = (member: PublicTeamMember, mediaVariants: UploadMediaVariantsMap) => {
  const image = String(member.avatarUrl || "").trim();
  if (!image || image === "/placeholder.svg") {
    return "/placeholder.svg";
  }
  const variantKey = normalizeUploadVariantUrlKey(image);
  const variantsVersion = Number(mediaVariants?.[variantKey]?.variantsVersion);
  if (!Number.isFinite(variantsVersion) || variantsVersion <= 0) {
    return image;
  }
  const normalizedVersion = Math.floor(variantsVersion);
  return image.includes("?")
    ? `${image}&v=${normalizedVersion}`
    : `${image}?v=${normalizedVersion}`;
};

const renderMemberCard = ({
  linkTypes,
  mediaVariants,
  member,
  prioritizeImage,
  retired = false,
  siteSettings,
}: {
  linkTypes: PublicTeamLinkType[];
  mediaVariants: UploadMediaVariantsMap;
  member: PublicTeamMember;
  prioritizeImage?: boolean;
  retired?: boolean;
  siteSettings?: SiteSettings | null;
}) => (
  <PublicUserProfileCard
    key={member.id}
    member={member}
    linkTypes={linkTypes}
    mediaVariants={mediaVariants}
    retired={retired}
    imageSrc={getMemberImageSrc(member, mediaVariants)}
    imageLoading={prioritizeImage ? "eager" : "lazy"}
    imageFetchPriority={prioritizeImage ? "high" : "auto"}
    imageSizes={TEAM_AVATAR_IMAGE_SIZES}
    siteSettings={siteSettings}
  />
);

const PublicTeamPageContent = ({
  isLoading = false,
  linkTypes,
  mediaVariants,
  members,
  pageCopy,
  siteSettings,
}: PublicTeamPageContentProps) => {
  const retiredMembers = sortMembersByOrder(
    members.filter((member) => ["retired", "aposentado"].includes(normalizeStatus(member.status))),
  );
  const activeMembers = sortMembersByOrder(
    members.filter((member) => !["retired", "aposentado"].includes(normalizeStatus(member.status))),
  );
  const prioritizedMemberId = activeMembers[0]?.id || retiredMembers[0]?.id || "";

  return (
    <section
      className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-20 pt-6 reveal`}
      data-reveal
    >
      {isLoading ? (
        <div className="mt-10 rounded-2xl border border-border/60 bg-card/60 px-6 py-10 text-sm text-muted-foreground">
          Carregando equipe...
        </div>
      ) : members.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border/60 bg-card/60 px-6 py-10 text-sm text-muted-foreground">
          Nenhum membro disponível no momento.
        </div>
      ) : (
        <>
          {activeMembers.length > 0 ? (
            <section className="mt-10" aria-labelledby="team-active-members-heading">
              <h2 id="team-active-members-heading" className="sr-only">
                Membros ativos
              </h2>
              <div className="grid gap-8 md:gap-10">
                {activeMembers.map((member) =>
                  renderMemberCard({
                    member,
                    linkTypes,
                    mediaVariants,
                    prioritizeImage: member.id === prioritizedMemberId,
                    siteSettings,
                  }),
                )}
              </div>
            </section>
          ) : null}

          {retiredMembers.length > 0 ? (
            <section className="mt-16 space-y-6" aria-labelledby="team-retired-members-heading">
              {pageCopy.retiredTitle || pageCopy.retiredSubtitle ? (
                <div>
                  {pageCopy.retiredTitle ? (
                    <h2
                      id="team-retired-members-heading"
                      className="text-lg font-semibold text-foreground"
                    >
                      {pageCopy.retiredTitle}
                    </h2>
                  ) : null}
                  {pageCopy.retiredSubtitle ? (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {pageCopy.retiredSubtitle}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-8 grid gap-8 md:gap-10">
                {retiredMembers.map((member) =>
                  renderMemberCard({
                    member,
                    linkTypes,
                    mediaVariants,
                    prioritizeImage: member.id === prioritizedMemberId,
                    retired: true,
                    siteSettings,
                  }),
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
};

export default PublicTeamPageContent;
