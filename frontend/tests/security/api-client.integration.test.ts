import axios from 'axios';
import apiClient from '../../src/lib/api-client';

describe('API Client', () => {
  it('should have withCredentials set to true', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('should have Content-Type header set to application/json', () => {
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('should have a baseURL configured', () => {
    expect(apiClient.defaults.baseURL).toBeDefined();
  });

  it('should be a separate axios instance', () => {
    expect(apiClient).not.toBe(axios);
  });
});
