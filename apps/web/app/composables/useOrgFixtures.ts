import { fixtureMemberships, fixtureOrganizations } from '../data/fixtures';

export interface MembershipOrg {
  slug: string;
  name: string;
  role: string;
  memberCount: number;
  moduleCount: number;
  current: boolean;
}

/** Foundation: org/membership data from fixtures (backend Phase 2 endpoint pending). */
export function useOrgFixtures() {
  const membershipOrgs = computed<MembershipOrg[]>(() =>
    fixtureMemberships.map((m) => {
      const org = fixtureOrganizations.find((o) => o.id === m.organizationId);
      return {
        slug: org?.slug ?? m.organizationId,
        name: org?.name ?? m.organizationId,
        role: m.role,
        memberCount: m.memberCount,
        moduleCount: m.moduleCount,
        current: m.current,
      };
    }),
  );
  return { membershipOrgs };
}
