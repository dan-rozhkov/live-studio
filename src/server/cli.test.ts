import { describe, it, expect } from 'vitest';
import { parseArgs } from './cli';

describe('parseArgs', () => {
  describe('port validation [1, 65535]', () => {
    it('accepts a valid port', () => {
      expect(parseArgs(['--port', '8080'])).toEqual({
        kind: 'run',
        command: undefined,
        port: 8080,
      });
    });

    it('accepts the -p alias', () => {
      expect(parseArgs(['-p', '1'])).toMatchObject({ kind: 'run', port: 1 });
      expect(parseArgs(['-p', '65535'])).toMatchObject({ kind: 'run', port: 65535 });
    });

    it('rejects port 0 (below range)', () => {
      expect(parseArgs(['--port', '0'])).toEqual({
        kind: 'error',
        message: 'Invalid port: 0',
      });
    });

    it('rejects port 65536 (above range)', () => {
      expect(parseArgs(['--port', '65536'])).toEqual({
        kind: 'error',
        message: 'Invalid port: 65536',
      });
    });

    it('rejects a negative port', () => {
      // parseInt("-1", 10) === -1 → < 1 → invalid
      expect(parseArgs(['--port', '-1'])).toEqual({
        kind: 'error',
        message: 'Invalid port: -1',
      });
    });

    it('rejects a non-numeric port', () => {
      expect(parseArgs(['--port', 'abc'])).toEqual({
        kind: 'error',
        message: 'Invalid port: abc',
      });
    });

    it('rejects a missing port value', () => {
      // --port with no following arg: val is undefined → invalid
      expect(parseArgs(['--port'])).toEqual({
        kind: 'error',
        message: 'Invalid port: undefined',
      });
    });

    it('parses partial-numeric values via parseInt (current behavior)', () => {
      // parseInt("80abc", 10) === 80 — documents lenient current behavior.
      expect(parseArgs(['--port', '80abc'])).toMatchObject({ kind: 'run', port: 80 });
    });
  });

  describe('help / version early return', () => {
    it('returns help for --help', () => {
      expect(parseArgs(['--help'])).toEqual({ kind: 'help' });
    });

    it('returns help for -h', () => {
      expect(parseArgs(['-h'])).toEqual({ kind: 'help' });
    });

    it('returns version for --version', () => {
      expect(parseArgs(['--version'])).toEqual({ kind: 'version' });
    });

    it('returns version for -v', () => {
      expect(parseArgs(['-v'])).toEqual({ kind: 'version' });
    });

    it('help takes priority over later args', () => {
      expect(parseArgs(['--help', '--port', '8080'])).toEqual({ kind: 'help' });
    });
  });

  describe('commands and unknown flags', () => {
    it('returns run with no command for empty argv', () => {
      expect(parseArgs([])).toEqual({ kind: 'run', command: undefined, port: undefined });
    });

    it('captures a positional command (install)', () => {
      expect(parseArgs(['install'])).toEqual({
        kind: 'run',
        command: 'install',
        port: undefined,
      });
    });

    it('combines a command with a port', () => {
      expect(parseArgs(['install', '--port', '9000'])).toEqual({
        kind: 'run',
        command: 'install',
        port: 9000,
      });
    });

    it('rejects an unknown flag', () => {
      expect(parseArgs(['--nope'])).toEqual({
        kind: 'error',
        message: 'Unknown flag: --nope',
      });
    });

    it('rejects an unknown short flag', () => {
      expect(parseArgs(['-x'])).toEqual({
        kind: 'error',
        message: 'Unknown flag: -x',
      });
    });
  });
});
