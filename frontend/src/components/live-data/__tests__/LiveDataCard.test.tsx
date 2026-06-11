/// <reference types="@testing-library/jest-dom" />
import { useLiveDataCurrent, useStartLiveData, useStopLiveData } from '../../../hooks/useLiveData';
import { useAgentStatus } from '../../../hooks/useAgentStatus';

jest.mock('../../../hooks/useLiveData', () => ({
  useLiveDataCurrent: jest.fn(),
  useStartLiveData: jest.fn(),
  useStopLiveData: jest.fn(),
}));

jest.mock('../../../hooks/useAgentStatus', () => ({
  useAgentStatus: jest.fn(),
}));

const useLiveDataCurrentMock = useLiveDataCurrent as unknown as jest.Mock;
const useStartLiveDataMock = useStartLiveData as unknown as jest.Mock;
const useStopLiveDataMock = useStopLiveData as unknown as jest.Mock;
const useAgentStatusMock = useAgentStatus as unknown as jest.Mock;

import { renderWithProviders, screen, fireEvent, act } from '../../../../tests/test-utils';
import { LiveDataCard } from '../LiveDataCard';

function baseMocks(overrides: {
  current?: { data: any; isLoading: boolean; isError: boolean };
  agents?: { data: any[]; isLoading: boolean; isError: boolean };
  start?: { mutateAsync: jest.Mock; isPending: boolean; error: unknown };
  stop?: { mutateAsync: jest.Mock; isPending: boolean; error: unknown };
} = {}) {
  useAgentStatusMock.mockReturnValue(
    overrides.agents ?? {
      data: [
        { id: 'agent-1', name: 'Workshop Agent', status: 'ONLINE' },
      ],
      isLoading: false,
      isError: false,
    },
  );
  useLiveDataCurrentMock.mockReturnValue(
    overrides.current ?? { data: null, isLoading: false, isError: false },
  );
  useStartLiveDataMock.mockReturnValue(
    overrides.start ?? {
      mutateAsync: jest.fn().mockResolvedValue({ liveDataSessionId: 'live-1' }),
      isPending: false,
      error: null,
    },
  );
  useStopLiveDataMock.mockReturnValue(
    overrides.stop ?? {
      mutateAsync: jest.fn().mockResolvedValue({}),
      isPending: false,
      error: null,
    },
  );
}

describe('LiveDataCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the start button when no live data session is active', () => {
    baseMocks();
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    expect(
      screen.getByRole('button', { name: /start live data/i }),
    ).toBeInTheDocument();
  });

  it('lists paired agents in the agent selector', () => {
    baseMocks({
      agents: {
        data: [
          { id: 'agent-1', name: 'Workshop Agent', status: 'ONLINE' },
          { id: 'agent-2', name: 'Bay 2 Agent', status: 'OFFLINE' },
        ],
        isLoading: false,
        isError: false,
      },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    const select = screen.getByLabelText(/agent/i) as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    // Auto-pick selects the first ONLINE agent.
    expect(select.value).toBe('agent-1');
  });

  it('disables the start button when no agent is paired', () => {
    baseMocks({
      agents: { data: [], isLoading: false, isError: false },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    const start = screen.getByRole('button', { name: /start live data/i });
    expect(start).toBeDisabled();
  });

  it('calls start mutation with the selected agent and diagnostic session id', async () => {
    const mutate = jest.fn().mockResolvedValue({ liveDataSessionId: 'live-1' });
    baseMocks({
      start: { mutateAsync: mutate, isPending: false, error: null },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start live data/i }));
    });
    expect(mutate).toHaveBeenCalledWith({
      diagnosticSessionId: 'session-1',
      agentId: 'agent-1',
    });
  });

  it('renders a loading state while the start mutation is pending', () => {
    baseMocks({
      start: { mutateAsync: jest.fn(), isPending: true, error: null },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    expect(screen.getByText(/starting live data/i)).toBeInTheDocument();
  });

  it('renders the active state with current PID values', () => {
    baseMocks({
      current: {
        data: {
          sessionId: 'live-1',
          status: 'ACTIVE',
          cadenceMs: 1000,
          lastActivityAt: '2026-06-11T12:00:00Z',
          values: {
            rpm: { value: 1234, unit: 'rpm', name: 'Engine RPM', status: 'OK' },
            speed: { value: 0, unit: 'km/h', name: 'Vehicle Speed', status: 'OK' },
            coolantTemp: { value: 92, unit: '°C', name: 'Coolant Temp', status: 'OK' },
            batteryVoltage: { value: 13.9, unit: 'V', name: 'Battery Voltage', status: 'OK' },
            throttlePosition: { value: 0, unit: '%', name: 'Throttle', status: 'OK' },
            engineLoad: { value: 20, unit: '%', name: 'Engine Load', status: 'OK' },
          },
        },
        isLoading: false,
        isError: false,
      },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);

    const card = screen.getByTestId('live-data-card');
    expect(card.getAttribute('data-status')).toBe('ACTIVE');

    expect(screen.getByTestId('live-pid-rpm')).toHaveTextContent('1234');
    expect(screen.getByTestId('live-pid-speed')).toHaveTextContent('0');
    expect(screen.getByTestId('live-pid-coolantTemp')).toHaveTextContent('92');
    expect(screen.getByTestId('live-pid-batteryVoltage')).toHaveTextContent('13.9');
    expect(screen.getByTestId('live-pid-engineLoad')).toHaveTextContent('20');
  });

  it('renders the stop button when an active session exists', () => {
    baseMocks({
      current: {
        data: {
          sessionId: 'live-1',
          status: 'ACTIVE',
          cadenceMs: 1000,
          lastActivityAt: '2026-06-11T12:00:00Z',
          values: {},
        },
        isLoading: false,
        isError: false,
      },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    expect(
      screen.getByRole('button', { name: /stop live data/i }),
    ).toBeInTheDocument();
  });

  it('calls stop mutation with the active session id', async () => {
    const mutate = jest.fn().mockResolvedValue({});
    baseMocks({
      current: {
        data: {
          sessionId: 'live-99',
          status: 'ACTIVE',
          cadenceMs: 1000,
          lastActivityAt: '2026-06-11T12:00:00Z',
          values: {},
        },
        isLoading: false,
        isError: false,
      },
      stop: { mutateAsync: mutate, isPending: false, error: null },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop live data/i }));
    });
    expect(mutate).toHaveBeenCalledWith({
      diagnosticSessionId: 'session-1',
      liveDataSessionId: 'live-99',
    });
  });

  it('renders a stopped state and re-enables start', () => {
    baseMocks({
      current: {
        data: {
          sessionId: 'live-1',
          status: 'STOPPED',
          cadenceMs: 1000,
          lastActivityAt: '2026-06-11T12:00:00Z',
          values: {},
        },
        isLoading: false,
        isError: false,
      },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    const card = screen.getByTestId('live-data-card');
    expect(card.getAttribute('data-status')).toBe('STOPPED');
    // Stopped → start button should be visible again (no stop button).
    expect(
      screen.queryByRole('button', { name: /stop live data/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start live data/i }),
    ).toBeInTheDocument();
  });

  it('shows a readable error when start fails', async () => {
    const startError = Object.assign(new Error('Agent is offline.'), {
      message: 'Agent is offline.',
    });
    baseMocks({
      start: { mutateAsync: jest.fn(), isPending: false, error: startError },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    expect(screen.getByText('Agent is offline.')).toBeInTheDocument();
  });

  it('handles a NO_DATA reading gracefully', () => {
    baseMocks({
      current: {
        data: {
          sessionId: 'live-1',
          status: 'ACTIVE',
          cadenceMs: 1000,
          lastActivityAt: '2026-06-11T12:00:00Z',
          values: {
            rpm: { value: null, unit: 'rpm', name: 'Engine RPM', status: 'NO_DATA' },
          },
        },
        isLoading: false,
        isError: false,
      },
    });
    renderWithProviders(<LiveDataCard diagnosticSessionId="session-1" />);
    expect(screen.getByTestId('live-pid-rpm')).toHaveTextContent(/no data/i);
  });
});
