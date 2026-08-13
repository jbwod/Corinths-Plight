import { describe, expect, it } from "vitest";
import {
  COMPANION_CLASS_POLICIES_V1,
  COMPANION_PUBLIC_V1_PROFILE_ID,
  getCompanionClassPolicyV1,
} from "../src/companion-class-profile";

describe("public-v1 companion class conversion sheet", () => {
  it("publishes exactly all sixteen Classes.html companion classes with prices", () => {
    expect(COMPANION_CLASS_POLICIES_V1).toHaveLength(16);
    expect(new Set(COMPANION_CLASS_POLICIES_V1.map((policy) => policy.id)).size).toBe(16);
    expect(COMPANION_CLASS_POLICIES_V1.every((policy) => Number.isInteger(policy.requisitionCost) && policy.requisitionCost > 0)).toBe(true);
    expect(COMPANION_CLASS_POLICIES_V1.every((policy) => (policy.decisionReferences as readonly string[]).includes(COMPANION_PUBLIC_V1_PROFILE_ID) || policy.id === "unit-power-armoured-infantry")).toBe(true);
  });

  it("converts legacy vehicle, mech and aerospace FS to equal numeric Hits", () => {
    expect(getCompanionClassPolicyV1("unit-light-battle-tank")).toMatchObject({ healthModel: "HITS", maximumHealth: 3 });
    expect(getCompanionClassPolicyV1("unit-medium-mech")).toMatchObject({ healthModel: "HITS", maximumHealth: 4 });
    expect(getCompanionClassPolicyV1("unit-vtol-heavy-lift")).toMatchObject({ healthModel: "HITS", maximumHealth: 3 });
  });

  it("retains Force Strength for personnel and crewed field artillery", () => {
    for (const id of ["unit-power-armoured-infantry", "unit-irregular", "unit-special-forces", "unit-sappers", "unit-light-artillery", "unit-heavy-artillery"]) {
      expect(getCompanionClassPolicyV1(id).healthModel).toBe("FORCE_STRENGTH");
    }
  });

  it("publishes the complete Power Armour action and transport profile", () => {
    expect(getCompanionClassPolicyV1("unit-power-armoured-infantry")).toMatchObject({
      requisitionCost: 10,
      allowedActions: ["ATTACK", "DIG_IN", "SHIELD_WALL", "MOUNT_MAGNETIC_CLAMPS", "DISMOUNT_MAGNETIC_CLAMPS"],
      signatureMechanics: expect.arrayContaining([
        "SHIELD_WALL",
        "MAGNETIC_CLAMP_RIDER",
        "HEAVY_DROP_POD_INSERTION",
        "UNLOCKABLE_BACK_LIGHT_LASER",
      ]),
      transportPolicy: ["GROUND", "HEAVY_DROP_POD"],
    });
  });

  it("contains no unpriced or weaponless combat chassis", () => {
    for (const policy of COMPANION_CLASS_POLICIES_V1) {
      if (policy.id === "unit-vtol-heavy-lift") continue;
      expect(policy.weapons.length, policy.id).toBeGreaterThan(0);
      expect((policy.weapons as readonly import("../src/companion-class-profile").CompanionWeaponPolicyV1[])
        .every((weapon) => weapon.fittedOnly || (weapon.damage.count > 0 && weapon.damage.sides > 0))).toBe(true);
    }
  });
});
