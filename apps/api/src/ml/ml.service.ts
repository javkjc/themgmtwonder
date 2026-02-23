import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface MlServiceResponse<T> {
  ok: boolean;
  error?: { code: string; message: string };
  data?: T;
}

interface FieldSuggestion {
  segmentId: string;
  fieldKey: string;
  confidence: number;
}

interface TableDetection {
  regionId: string;
  rowCount: number;
  columnCount: number;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  cells: Array<{
    rowIndex: number;
    columnIndex: number;
    text: string;
    segmentId: string;
  }>;
  suggestedLabel: string;
}

interface SuggestFieldsPayload {
  baselineId: string;
  modelVersionId?: string;
  filePath?: string;
  segments: Array<{
    id: string;
    text: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
    pageNumber?: number;
  }>;
  fields: Array<{
    fieldKey: string;
    label: string;
    characterType?: string;
  }>;
  pairCandidates?: Array<{
    labelSegmentId: string;
    valueSegmentId: string;
    pairConfidence: number;
    relation: string;
    pageNumber?: number;
  }>;
  segmentContext?: Array<{
    segmentId: string;
    contextText: string;
    contextSegmentIds: string[];
  }>;
  threshold?: number;
}

interface DetectTablesPayload {
  attachmentId: string;
  segments: Array<{
    id: string;
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    pageNumber?: number;
    confidence?: number;
  }>;
  threshold?: number;
}

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);
  private readonly mlServiceUrl: string;
  private readonly timeout = 5000; // 5 seconds

  constructor(private configService: ConfigService) {
    this.mlServiceUrl =
      this.configService.get<string>('ML_SERVICE_URL') ||
      'http://ml-service:5000';
  }

  async suggestFields(
    payload: SuggestFieldsPayload,
  ): Promise<MlServiceResponse<FieldSuggestion[]>> {
    return this.callMlEndpoint<FieldSuggestion[]>(
      '/ml/suggest-fields',
      payload,
    );
  }

  async detectTables(
    payload: DetectTablesPayload,
  ): Promise<MlServiceResponse<TableDetection[]>> {
    return this.callMlEndpoint<TableDetection[]>('/ml/detect-tables', payload);
  }

  async activateModel(payload: {
    version: string;
    filePath: string;
  }): Promise<{ ok: boolean; activeVersion?: string; error?: { code: string; message: string } }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${this.mlServiceUrl}/ml/models/activate`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.error('ML service activate error', {
          service: 'ml-service',
          endpoint: '/ml/models/activate',
          statusCode: response.status,
          errorType: 'http_error',
        });
        return {
          ok: false,
          error: { code: 'ML_SERVICE_ERROR', message: `ML service returned status ${response.status}` },
        };
      }

      const result = await response.json();
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      const errorType = error.name === 'AbortError' ? 'timeout' : 'network_error';
      this.logger.error('ML service activate call failed', {
        service: 'ml-service',
        endpoint: '/ml/models/activate',
        statusCode: null,
        errorType,
        errorMessage: error.message,
      });
      return {
        ok: false,
        error: {
          code: errorType === 'timeout' ? 'ML_TIMEOUT' : 'ML_NETWORK_ERROR',
          message: errorType === 'timeout' ? 'ML service request timed out' : 'Failed to connect to ML service',
        },
      };
    }
  }

  private async callMlEndpoint<T>(
    endpoint: string,
    payload: unknown,
  ): Promise<MlServiceResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${this.mlServiceUrl}${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.error('ML service error', {
          service: 'ml-service',
          endpoint,
          statusCode: response.status,
          errorType: 'http_error',
        });

        return {
          ok: false,
          error: {
            code: 'ML_SERVICE_ERROR',
            message: `ML service returned status ${response.status}`,
          },
        };
      }

      const result = await response.json();

      // ML service may return {ok: false, error: {...}} internally
      if (result.ok === false) {
        this.logger.error('ML service internal error', {
          service: 'ml-service',
          endpoint,
          statusCode: response.status,
          errorType: result.error?.code || 'internal_error',
        });

        return {
          ok: false,
          error: result.error || {
            code: 'ML_INTERNAL_ERROR',
            message: 'ML service internal error',
          },
        };
      }

      // Success - extract data (field suggestions or table detections)
      const data = result.suggestions || result.tables || [];
      return { ok: true, data };
    } catch (error) {
      clearTimeout(timeoutId);

      const errorType =
        error.name === 'AbortError' ? 'timeout' : 'network_error';

      this.logger.error('ML service call failed', {
        service: 'ml-service',
        endpoint,
        statusCode: null,
        errorType,
        errorMessage: error.message,
      });

      return {
        ok: false,
        error: {
          code: errorType === 'timeout' ? 'ML_TIMEOUT' : 'ML_NETWORK_ERROR',
          message:
            errorType === 'timeout'
              ? 'ML service request timed out'
              : 'Failed to connect to ML service',
        },
      };
    }
  }
}
