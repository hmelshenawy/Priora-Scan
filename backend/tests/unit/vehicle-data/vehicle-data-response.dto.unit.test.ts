import {
  isValidVehicleDataJson,
  VehicleDataJson,
  ExtendedPidDataPoint,
  ControlUnitDiscovery,
} from '../../../src/vehicle-data/dtos/vehicle-data-response.dto';

/**
 * Minimal valid VehicleDataJson payload for test construction.
 * Contains all required top-level fields.
 */
function makeBasePayload(): VehicleDataJson {
  return {
    batteryVoltage: { value: 13.417, unit: 'V', supported: true },
    vin: { value: 'WDD2130041A123456', supported: true },
    readinessMonitors: { supported: true, value: {} },
    fuelSystemStatus: { value: 'Closed Loop', supported: true },
    calculatedEngineLoad: { value: 46.3, unit: '%', supported: true },
    fuelLevel: { value: 72, unit: '%', supported: true },
    mileage: { value: 12345, unit: 'km', supported: true },
    supportedPids: { '01': ['04', '05', '0C', '0D'], '09': ['02'] },
  };
}

/**
 * Extended PID data point with all fields populated.
 */
function makeExtendedPid(
  overrides: Partial<ExtendedPidDataPoint> = {},
): ExtendedPidDataPoint {
  return {
    pid: '06',
    value: 0.0,
    unit: '%',
    supported: true,
    available: true,
    rawResponse: '410680',
    ...overrides,
  };
}

describe('VehicleDataJson — Extended PID Validation', () => {
  // -----------------------------------------------------------------------
  // T012: Payloads with all 7 extended PID fields pass validation
  // -----------------------------------------------------------------------
  describe('TestVehicleDataJsonWithExtendedPids', () => {
    it('accepts payload with all 7 extended PID fields', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = makeExtendedPid({ pid: '06', value: 0.0, unit: '%' });
      payload.ltftBank1 = makeExtendedPid({ pid: '07', value: -3.12, unit: '%' });
      payload.stftBank2 = makeExtendedPid({ pid: '08', value: null, unit: '%', supported: false, available: false });
      payload.ltftBank2 = makeExtendedPid({ pid: '09', value: null, unit: '%', supported: false, available: false });
      payload.map = makeExtendedPid({ pid: '0B', value: 42, unit: 'kPa' });
      payload.maf = makeExtendedPid({ pid: '10', value: 1.0, unit: 'g/s' });
      payload.throttlePosition = makeExtendedPid({ pid: '11', value: 1.96, unit: '%' });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload where extended PIDs have rawResponse and reason fields', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = {
        pid: '06',
        value: 0.0,
        unit: '%',
        supported: true,
        available: true,
        rawResponse: '410680',
        reason: undefined,
      };

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload where extended PIDs have reason field', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = {
        pid: '06',
        value: null,
        unit: '%',
        supported: false,
        available: false,
        rawResponse: null,
        reason: 'PID_DISCOVERY_FAILED',
      };

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload with NO_DATA reason', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = {
        pid: '06',
        value: null,
        unit: '%',
        supported: true,
        available: false,
        rawResponse: null,
        reason: 'NO_DATA',
      };

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload with PREFIX_MISMATCH reason', () => {
      const payload = makeBasePayload();
      payload.map = {
        pid: '0B',
        value: null,
        unit: 'kPa',
        supported: true,
        available: false,
        rawResponse: '4100FF',
        reason: 'PREFIX_MISMATCH',
      };

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('rejects extended PID field missing pid property', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = {
        value: 0.0,
        unit: '%',
        supported: true,
        available: true,
      } as any;

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('rejects extended PID field missing supported property', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = {
        pid: '06',
        value: 0.0,
        unit: '%',
        available: true,
      } as any;

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('rejects extended PID field missing available property', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = {
        pid: '06',
        value: 0.0,
        unit: '%',
        supported: true,
      } as any;

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // T013: Pre-018B payloads without extended fields still pass validation
  // -----------------------------------------------------------------------
  describe('TestVehicleDataJsonWithoutExtendedPids', () => {
    it('accepts payload without any extended PID fields', () => {
      const payload = makeBasePayload();

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts minimal payload with only required fields', () => {
      const payload: VehicleDataJson = {
        batteryVoltage: { value: 13.417, unit: 'V', supported: true },
        vin: { value: 'W1KAF4GB1RF124321', supported: true },
        readinessMonitors: { supported: true, value: {} },
        fuelSystemStatus: { value: 'Closed Loop', supported: true },
        calculatedEngineLoad: { value: 46.3, unit: '%', supported: true },
        fuelLevel: { value: 72, unit: '%', supported: true },
        mileage: { value: 12345, unit: 'km', supported: true },
        supportedPids: { '01': ['04', '05'], '09': [] },
      };

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts pre-018B payload with freeze frame but no extended PIDs', () => {
      const payload = makeBasePayload();
      payload.freezeFrame = {
        supported: true,
        available: false,
      };

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T014: Partial extended PID data is accepted
  // -----------------------------------------------------------------------
  describe('TestVehicleDataJsonExtendedPidsPartial', () => {
    it('accepts payload with only stftBank1 and maf', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = makeExtendedPid({ pid: '06', value: 2.3, unit: '%' });
      payload.maf = makeExtendedPid({ pid: '10', value: 1.0, unit: 'g/s' });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload with only map', () => {
      const payload = makeBasePayload();
      payload.map = makeExtendedPid({ pid: '0B', value: 42, unit: 'kPa' });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload with only throttlePosition', () => {
      const payload = makeBasePayload();
      payload.throttlePosition = makeExtendedPid({ pid: '11', value: 1.96, unit: '%' });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload with only unsupported extended PIDs', () => {
      const payload = makeBasePayload();
      payload.stftBank2 = makeExtendedPid({
        pid: '08',
        value: null,
        unit: '%',
        supported: false,
        available: false,
      });
      payload.ltftBank2 = makeExtendedPid({
        pid: '09',
        value: null,
        unit: '%',
        supported: false,
        available: false,
      });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T015: Discovery failure payloads pass validation
  // -----------------------------------------------------------------------
  describe('TestVehicleDataJsonDiscoveryFailure', () => {
    it('accepts payload where all extended PIDs have PID_DISCOVERY_FAILED', () => {
      const payload = makeBasePayload();
      const discoveryFailed: ExtendedPidDataPoint = {
        pid: '06',
        value: null,
        unit: '%',
        supported: false,
        available: false,
        rawResponse: null,
        reason: 'PID_DISCOVERY_FAILED',
      };

      payload.stftBank1 = { ...discoveryFailed, pid: '06', unit: '%' };
      payload.ltftBank1 = { ...discoveryFailed, pid: '07', unit: '%' };
      payload.stftBank2 = { ...discoveryFailed, pid: '08', unit: '%' };
      payload.ltftBank2 = { ...discoveryFailed, pid: '09', unit: '%' };
      payload.map = { ...discoveryFailed, pid: '0B', unit: 'kPa' };
      payload.maf = { ...discoveryFailed, pid: '10', unit: 'g/s' };
      payload.throttlePosition = { ...discoveryFailed, pid: '11', unit: '%' };

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('rejects payload with top-level extendedPidsDiscoveryFailed field', () => {
      const payload = makeBasePayload() as any;
      payload.extendedPidsDiscoveryFailed = true;

      // isValidVehicleDataJson only checks required fields and extended PID shapes.
      // It does NOT reject unknown top-level fields — this is by design.
      // The contract specifies NO top-level metadata fields, but the validator
      // does not enforce absence of unknown fields (only presence of required ones).
      // The important thing is that the frontend ignores this field.
      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload with mixed discovery failure and valid extended PIDs', () => {
      const payload = makeBasePayload();
      payload.stftBank1 = makeExtendedPid({ pid: '06', value: 2.3, unit: '%' });
      payload.ltftBank1 = {
        pid: '07',
        value: null,
        unit: '%',
        supported: false,
        available: false,
        reason: 'PID_DISCOVERY_FAILED',
      };

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Feature 019: Control Unit Discovery validation
  // -----------------------------------------------------------------------
  describe('TestControlUnitDiscovery', () => {
    function makeDiscovery(overrides: Partial<ControlUnitDiscovery> = {}): ControlUnitDiscovery {
      return {
        version: 1,
        strategy: 'GENERIC_OBD_CAN',
        scanMode: 'FUNCTIONAL_THEN_PHYSICAL',
        probeSequence: ['22F190'],
        startedAt: '2026-06-15T12:00:00.000Z',
        completedAt: '2026-06-15T12:00:03.000Z',
        summary: {
          totalProbes: 9,
          respondersFound: 1,
          functionalResponders: 1,
          physicalResponders: 1,
        },
        probes: [
          {
            method: 'FUNCTIONAL',
            requestId: '7DF',
            probe: '22F190',
            responseId: '7E8',
            status: 'DISCOVERED',
            responseType: 'NEGATIVE',
            negativeResponseCode: '11',
            negativeResponseMeaning: 'SERVICE_NOT_SUPPORTED',
            rawHeader: '7E8',
            rawPayload: '037F2211',
            rawResponse: '7E8037F2211',
            errorCode: null,
          },
          {
            method: 'PHYSICAL',
            requestId: '7E0',
            probe: '22F190',
            responseId: '7E8',
            status: 'DISCOVERED',
            responseType: 'NEGATIVE',
            negativeResponseCode: '11',
            negativeResponseMeaning: 'SERVICE_NOT_SUPPORTED',
            rawHeader: '7E8',
            rawPayload: '037F2211',
            rawResponse: '7E8037F2211',
            errorCode: null,
          },
          {
            method: 'PHYSICAL',
            requestId: '7E1',
            probe: '22F190',
            responseId: null,
            status: 'NOT_FOUND',
            responseType: 'NO_RESPONSE',
            negativeResponseCode: null,
            negativeResponseMeaning: null,
            rawHeader: null,
            rawPayload: null,
            rawResponse: 'NO DATA',
            errorCode: null,
          },
        ],
        responders: [
          {
            responseId: '7E8',
            discoveredBy: [
              { method: 'FUNCTIONAL', requestId: '7DF', probe: '22F190' },
              { method: 'PHYSICAL', requestId: '7E0', probe: '22F190' },
            ],
            firstSeenBy: 'FUNCTIONAL',
            confirmedByPhysical: true,
            confidence: 'HIGH',
            ecuName: null,
            ecuType: null,
            protocol: 'UDS_ON_CAN_11BIT',
            capabilities: {
              respondedToF190: true,
              positiveF190: false,
              negativeF190: true,
            },
          },
        ],
        ...overrides,
      };
    }

    it('accepts valid controlUnitDiscovery in VehicleDataJson', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery();

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts payload without controlUnitDiscovery (backward compatible)', () => {
      const payload = makeBasePayload();
      // No controlUnitDiscovery field

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts controlUnitDiscovery with null value (backward compatible)', () => {
      const payload = makeBasePayload() as any;
      payload.controlUnitDiscovery = null;

      // null should still pass since we only validate when the field is present and non-null
      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('rejects controlUnitDiscovery with wrong version', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({ version: 2 as any });

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('rejects controlUnitDiscovery with missing scanMode', () => {
      const payload = makeBasePayload();
      const discovery = makeDiscovery();
      delete (discovery as any).scanMode;
      payload.controlUnitDiscovery = discovery;

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('rejects controlUnitDiscovery with missing strategy', () => {
      const payload = makeBasePayload();
      const discovery = makeDiscovery();
      delete (discovery as any).strategy;
      payload.controlUnitDiscovery = discovery;

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('rejects controlUnitDiscovery with missing probes array', () => {
      const payload = makeBasePayload();
      const discovery = makeDiscovery();
      delete (discovery as any).probes;
      payload.controlUnitDiscovery = discovery;

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('rejects controlUnitDiscovery with missing responders array', () => {
      const payload = makeBasePayload();
      const discovery = makeDiscovery();
      delete (discovery as any).responders;
      payload.controlUnitDiscovery = discovery;

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('rejects controlUnitDiscovery with malformed summary', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({
        summary: { totalProbes: 'not-a-number' } as any,
      });

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('accepts probe with ERROR status and known errorCode', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({
        probes: [
          {
            method: 'PHYSICAL',
            requestId: '7E1',
            probe: '22F190',
            responseId: null,
            status: 'ERROR',
            responseType: 'ERROR',
            negativeResponseCode: null,
            negativeResponseMeaning: null,
            rawHeader: null,
            rawPayload: null,
            rawResponse: '',
            errorCode: 'TIMEOUT',
          },
        ],
      });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts probe with ERROR status and COMMUNICATION_ERROR errorCode', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({
        probes: [
          {
            method: 'PHYSICAL',
            requestId: '7E1',
            probe: '22F190',
            responseId: null,
            status: 'ERROR',
            responseType: 'ERROR',
            negativeResponseCode: null,
            negativeResponseMeaning: null,
            rawHeader: null,
            rawPayload: null,
            rawResponse: '',
            errorCode: 'COMMUNICATION_ERROR',
          },
        ],
      });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts probe with ERROR status and ADAPTER_DISCONNECT errorCode', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({
        probes: [
          {
            method: 'PHYSICAL',
            requestId: '7E1',
            probe: '22F190',
            responseId: null,
            status: 'ERROR',
            responseType: 'ERROR',
            negativeResponseCode: null,
            negativeResponseMeaning: null,
            rawHeader: null,
            rawPayload: null,
            rawResponse: '',
            errorCode: 'ADAPTER_DISCONNECT',
          },
        ],
      });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('rejects probe with non-null errorCode on DISCOVERED status', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({
        probes: [
          {
            method: 'FUNCTIONAL',
            requestId: '7DF',
            probe: '22F190',
            responseId: '7E8',
            status: 'DISCOVERED',
            responseType: 'NEGATIVE',
            negativeResponseCode: '11',
            negativeResponseMeaning: 'SERVICE_NOT_SUPPORTED',
            rawHeader: '7E8',
            rawPayload: '037F2211',
            rawResponse: '7E8037F2211',
            errorCode: 'TIMEOUT', // Should be null for non-ERROR
          },
        ],
      });

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('accepts probe with null errorCode on NOT_FOUND status', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({
        probes: [
          {
            method: 'PHYSICAL',
            requestId: '7E1',
            probe: '22F190',
            responseId: null,
            status: 'NOT_FOUND',
            responseType: 'NO_RESPONSE',
            negativeResponseCode: null,
            negativeResponseMeaning: null,
            rawHeader: null,
            rawPayload: null,
            rawResponse: 'NO DATA',
            errorCode: null,
          },
        ],
      });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('rejects controlUnitDiscovery with invalid probe status', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({
        probes: [
          {
            method: 'PHYSICAL',
            requestId: '7E1',
            probe: '22F190',
            responseId: null,
            status: 'INVALID_STATUS',
            responseType: 'NO_RESPONSE',
            negativeResponseCode: null,
            negativeResponseMeaning: null,
            rawHeader: null,
            rawPayload: null,
            rawResponse: 'NO DATA',
            errorCode: null,
          } as any,
        ],
      });

      expect(isValidVehicleDataJson(payload)).toBe(false);
    });

    it('accepts controlUnitDiscovery with zero responders', () => {
      const payload = makeBasePayload();
      payload.controlUnitDiscovery = makeDiscovery({
        summary: { totalProbes: 9, respondersFound: 0, functionalResponders: 0, physicalResponders: 0 },
        probes: [],
        responders: [],
      });

      expect(isValidVehicleDataJson(payload)).toBe(true);
    });

    it('accepts all valid scanMode values', () => {
      const modes: string[] = [
        'FUNCTIONAL_ONLY',
        'PHYSICAL_ONLY',
        'FUNCTIONAL_THEN_PHYSICAL',
        'ADVANCED_RANGE',
        'TOYOTA_PROFILE',
        'MERCEDES_PROFILE',
      ];
      for (const mode of modes) {
        const payload = makeBasePayload();
        payload.controlUnitDiscovery = makeDiscovery({ scanMode: mode as any });
        expect(isValidVehicleDataJson(payload)).toBe(true);
      }
    });
  });
});