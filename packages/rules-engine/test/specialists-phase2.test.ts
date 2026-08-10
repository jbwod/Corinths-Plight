import type {
  AirDropProfile,
  ArtilleryProfile,
  BomberProfile,
  FighterProfile,
  SpotterProfile,
  StealthProfile,
  WeaponProfile,
} from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  projectDetectedContacts,
  projectDetectedContactsAs,
  applyBombardmentSuppression,
  recoverBombardmentSuppression,
  rearmFighter,
  resolveStealthDetection,
  transitionArtilleryDeployment,
  validateAirDrop,
  validateArtilleryFire,
  validateBomberFlyOver,
  validateFighterAttack,
} from "../src";
import { makeHex } from "./fixtures";

const map = [makeHex(0, 0), makeHex(1, 0), makeHex(2, 0), makeHex(3, 0)];

describe("artillery deployment and spotting", () => {
  const artillery: ArtilleryProfile = {
    id: "artillery-v5",
    deploySpeedCostQuarters: 2,
    packSpeedCostQuarters: 2,
    mustBeDeployedForIndirectFire: true,
    indirectRequiresSpotter: true,
    fireSupplyType: "SMALL_SUPPLY",
    fireSupplyCost: 1,
  };
  const spotterProfile: SpotterProfile = {
    id: "ground-spotter",
    canSpotDomains: ["GROUND"],
    allowsFiringUnit: false,
    prohibitedTags: ["CANNOT_SPOT_GROUND"],
  };
  const weapon: WeaponProfile = {
    id: "barrage",
    name: "Barrage",
    damage: { count: 1, sides: 6 },
    range: 4,
    armorPiercing: 0,
    indirect: true,
    tags: ["INDIRECT"],
  };

  it("uses quarter-Speed deployment and requires another eligible friendly spotter", () => {
    expect(transitionArtilleryDeployment(artillery, "PACKED", "DEPLOY", 1)).toMatchObject({ legal: false });
    expect(transitionArtilleryDeployment(artillery, "PACKED", "DEPLOY", 2)).toEqual({
      legal: true,
      state: "DEPLOYED",
      speedCostQuarters: 2,
    });
    const target = { id: "target", side: "ENEMY" as const, status: "ACTIVE" as const, position: { q: 2, r: 0 }, domain: "GROUND" as const };
    const firingUnit = {
      id: "artillery",
      side: "ALLIED" as const,
      status: "ACTIVE" as const,
      position: { q: 0, r: 0 },
      sensorRange: 4,
      tags: [],
      profile: spotterProfile,
    };
    expect(
      validateArtilleryFire({
        profile: artillery,
        deploymentState: "DEPLOYED",
        firingUnitId: firingUnit.id,
        firingSide: "ALLIED",
        firingPosition: firingUnit.position,
        weapon,
        target,
        map,
        spotters: [firingUnit],
        supplyAvailable: 2,
      }),
    ).toMatchObject({ legal: false, reason: expect.stringMatching(/spotter/i) });
    expect(
      validateArtilleryFire({
        profile: artillery,
        deploymentState: "DEPLOYED",
        firingUnitId: firingUnit.id,
        firingSide: "ALLIED",
        firingPosition: firingUnit.position,
        weapon,
        target,
        map,
        spotters: [{ ...firingUnit, id: "spotter", position: { q: 1, r: 0 } }],
        supplyAvailable: 2,
      }),
    ).toMatchObject({ legal: true, spotterId: "spotter", supplySpent: 1, supplyAfter: 1 });
  });

  it("caps bombardment stacks at base Defense and recovers one per unbombarded round", () => {
    expect(applyBombardmentSuppression(2, 0)).toEqual({ before: 0, after: 1, defenseAfter: 1 });
    expect(applyBombardmentSuppression(2, 1)).toEqual({ before: 1, after: 2, defenseAfter: 0 });
    expect(applyBombardmentSuppression(2, 2)).toEqual({ before: 2, after: 2, defenseAfter: 0 });
    expect(recoverBombardmentSuppression(2, 2)).toEqual({ before: 2, after: 1, defenseAfter: 1 });
    expect(recoverBombardmentSuppression(2, 1)).toEqual({ before: 1, after: 0, defenseAfter: 2 });
  });
});

describe("stealth detection and fog-safe projection", () => {
  const infantryStealth: StealthProfile = {
    id: "infantry-stealth",
    mode: "INFANTRY_ROLL",
    revealOnAttack: true,
    revealOnInteraction: true,
  };
  const vehicleStealth: StealthProfile = {
    id: "vehicle-stealth",
    mode: "RANGE_REDUCTION",
    detectionRangeMultiplier: 0.5,
    rangeRounding: "CEIL",
    revealOnAttack: true,
    revealOnInteraction: true,
  };

  it("resolves infantry rolls, half-range vehicles, and detected-only contacts", () => {
    const unit = { id: "stealth-unit", position: { q: 2, r: 0 }, status: "ACTIVE" as const };
    const observers = [
      { id: "observer-a", position: { q: 0, r: 0 }, status: "ACTIVE" as const, sensorRange: 4 },
      { id: "observer-b", position: { q: 1, r: 0 }, status: "ACTIVE" as const, sensorRange: 4 },
    ];
    const hidden = resolveStealthDetection({ profile: infantryStealth, unit, observers, map, roll: 2 });
    expect(hidden).toMatchObject({ legal: true, detected: false, threshold: 2, roll: 2 });
    const detected = resolveStealthDetection({ profile: infantryStealth, unit, observers, map, roll: 1 });
    expect(detected.detected).toBe(true);

    expect(
      resolveStealthDetection({
        profile: vehicleStealth,
        unit,
        observers: [observers[0]],
        map,
      }),
    ).toMatchObject({ legal: true, detected: true });
    expect(projectDetectedContacts([{ id: unit.id }], { [unit.id]: hidden })).toEqual([]);
    expect(projectDetectedContacts([{ id: unit.id }], { [unit.id]: detected })).toEqual([{ id: unit.id }]);
    expect(
      projectDetectedContactsAs(
        [{ id: unit.id, ownerId: "private-owner", currentHealth: 2 }],
        { [unit.id]: detected },
        (contact) => ({ contactId: contact.id }),
      ),
    ).toEqual([{ contactId: unit.id }]);
  });

  it("enforces the V5 D6 ceiling and does not reveal an attacker beyond normal LOS", () => {
    const unit = { id: "stealth-unit", position: { q: 2, r: 0 }, status: "ACTIVE" as const };
    const sevenObservers = Array.from({ length: 7 }, (_, index) => ({
      id: `observer-${index}`,
      position: { q: 1, r: 0 },
      status: "ACTIVE" as const,
      sensorRange: 4,
    }));
    expect(resolveStealthDetection({ profile: infantryStealth, unit, observers: sevenObservers, map, roll: 6 })).toMatchObject({
      legal: true,
      detected: true,
      threshold: 7,
    });
    expect(resolveStealthDetection({ profile: infantryStealth, unit, observers: sevenObservers, map, roll: 7 })).toMatchObject({
      legal: false,
      detected: true,
    });
    expect(
      resolveStealthDetection({
        profile: infantryStealth,
        unit,
        observers: [{ id: "distant", position: { q: 0, r: 0 }, status: "ACTIVE", sensorRange: 1 }],
        map,
        attacked: true,
      }),
    ).toMatchObject({ legal: true, detected: false, observerIds: [], stealthBroken: true });
  });
});

describe("aerospace attack paths, ammunition, and drops", () => {
  const fighter: FighterProfile = {
    id: "fighter-v5",
    firingArcDegrees: 180,
    useTravelFacing: true,
    mainWeaponAmmoCapacity: 1,
    rearmRequiresLanding: true,
    rearmFacilityTags: ["AIRFIELD", "FLIGHT_DECK"],
    rearmActionEconomy: "PRIMARY",
  };
  const bomber: BomberProfile = {
    id: "bomber-v5",
    requiresTargetFlyOver: true,
    ordnanceAmmoCapacity: 1,
    rearmRequiresLanding: true,
    rearmFacilityTags: ["AIRFIELD", "FLIGHT_DECK"],
  };

  it("enforces the fighter forward arc, ammo use, and landed rearm", () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    expect(validateFighterAttack(fighter, route, 0, { q: 2, r: 0 }, 1)).toMatchObject({
      legal: true,
      firingFacing: 2,
      ammunitionAfter: 0,
    });
    expect(validateFighterAttack(fighter, route, 0, { q: 0, r: 0 }, 1)).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/arc/i),
    });
    expect(rearmFighter(fighter, 0, false, ["AIRFIELD"])).toMatchObject({ legal: false });
    expect(rearmFighter(fighter, 0, true, ["AIRFIELD"])).toEqual({
      legal: true,
      ammunitionAfter: 1,
      actionEconomy: "PRIMARY",
    });
  });

  it("requires a bomber fly-over and consumes one ordnance", () => {
    expect(validateBomberFlyOver(bomber, [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], { q: 1, r: 0 }, 1)).toEqual({
      legal: true,
      pathIndex: 1,
      ammunitionAfter: 0,
    });
    expect(validateBomberFlyOver(bomber, [{ q: 0, r: 0 }, { q: 1, r: 0 }], { q: 2, r: 0 }, 1)).toMatchObject({ legal: false });
  });

  it("accepts only eligible cargo on a straight HAT path into a clear destination", () => {
    const drop: AirDropProfile = {
      id: "hat-clear-drop",
      allowedCargoKinds: ["PERSONNEL", "VEHICLE"],
      requiredCargoTags: ["PARADROP_ELIGIBLE"],
      destinationMustBeOnFlightPath: true,
      requiresStraightFlightPath: true,
      requiresClearDestination: true,
      blockedTerrainIds: ["terrain-forest", "terrain-urban"],
      blockedEnvironmentTags: ["HAZARD"],
      allowStructuresAtDestination: false,
      hazardousDestinationPolicy: "REJECT",
    };
    const cargo = { id: "squad", kind: "PERSONNEL" as const, quantity: 6, tags: ["PARADROP_ELIGIBLE"] };
    expect(
      validateAirDrop({
        profile: drop,
        flightPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
        destination: map[1],
        cargo,
        currentOccupancy: 0,
      }),
    ).toEqual({ legal: true, reasons: [], hazardous: false });
    expect(
      validateAirDrop({
        profile: drop,
        flightPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
        destination: { ...map[1], terrainId: "terrain-forest" },
        cargo,
        currentOccupancy: 0,
      }),
    ).toMatchObject({ legal: false, hazardous: true });
  });
});
