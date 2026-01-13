import { Request, Response } from 'express';

import { IngestData } from '../models/IngestData';
import { IngestResponse } from '../models/IngestResponse';
import {
  BaseMetric,
  BloodPressureMetric,
  BloodPressureModel,
  HeartRateMetric,
  HeartRateModel,
  Metric,
  SleepMetric,
  SleepModel,
  mapMetric,
  createMetricModel,
} from '../models/Metric';
import { MetricName } from '../models/MetricName';
import { filterFields, parseDate } from '../utils';

export const getAvailableMetrics = async (_req: Request, res: Response) => {
  try {
    const db = HeartRateModel.db;
    const collections = await db.listCollections();

    // Filter out system collections and map to metric names
    const metrics = collections
      .map((col) => col.name)
      .filter((name) => !name.startsWith('system.'))
      .sort();

    res.json({ metrics });
  } catch (error) {
    console.error('Error getting available metrics:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error getting metrics' });
  }
};

export const getSources = async (_req: Request, res: Response) => {
  try {
    // Execute all queries in parallel for better performance
    const [heartRateSources, sleepSources, bpSources] = await Promise.all([
      HeartRateModel.distinct('source'),
      SleepModel.distinct('source'),
      BloodPressureModel.distinct('source'),
    ]);

    // Combine and deduplicate
    const allSources = [...new Set([...heartRateSources, ...sleepSources, ...bpSources])].sort();

    res.json({ sources: allSources });
  } catch (error) {
    console.error('Error getting sources:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error getting sources' });
  }
};

export const getMetrics = async (req: Request, res: Response) => {
  try {
    const { from, to, include, exclude, source } = req.query;
    const selectedMetric = req.params.selected_metric as MetricName;

    if (!selectedMetric) {
      throw new Error('No metric selected');
    }

    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    let query: Record<string, unknown> = {};

    if (fromDate && toDate) {
      query.date = {
        $gte: fromDate,
        $lte: toDate,
      };
    }

    // Filter by source/device name (supports multiple sources with comma separation)
    if (source && source !== '$__all' && source !== 'All') {
      const sources = (source as string)
        .split(',')
        .map(s => s.trim())
        .filter(s => s && s !== '$__all');

      if (sources.length > 0) {
        // Use exact match with $in for better index usage and security
        query.source = sources.length === 1 ? sources[0] : { $in: sources };
      }
    }

    let metrics;

    switch (selectedMetric) {
      case MetricName.BLOOD_PRESSURE:
        metrics = await BloodPressureModel.find(query).lean();
        break;
      case MetricName.HEART_RATE:
        metrics = await HeartRateModel.find(query).lean();
        break;
      case MetricName.SLEEP_ANALYSIS:
        metrics = await SleepModel.find(query).lean();
        break;
      default:
        metrics = await createMetricModel(selectedMetric).find(query).lean();
    }

    // Process include/exclude filters if provided
    if (include || exclude) {
      metrics = metrics.map((metric: Record<string, unknown>) => filterFields(metric, include, exclude));
    }

    res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error getting metrics' });
  }
};

export const saveMetrics = async (ingestData: IngestData): Promise<IngestResponse> => {
  try {
    const response: IngestResponse = {};
    const metricsData = ingestData.data.metrics;

    if (!metricsData || metricsData.length === 0) {
      response.metrics = {
        success: true,
        error: 'No metrics data provided',
      };
      return response;
    }

    // Group metrics by type and map the data
    const metricsByType = metricsData.reduce(
      (acc, metric) => {
        const mappedMetrics = mapMetric(metric);
        const key = metric.name;
        acc[key] = acc[key] || [];
        acc[key].push(...mappedMetrics);
        return acc;
      },
      {} as {
        [key: string]: Metric[];
      },
    );

    const saveOperations = Object.entries(metricsByType).map(([key, metrics]) => {
      switch (key as MetricName) {
        case MetricName.BLOOD_PRESSURE:
          const bpMetrics = metrics as BloodPressureMetric[];
          return BloodPressureModel.bulkWrite(
            bpMetrics.map((metric) => ({
              updateOne: {
                filter: { source: metric.source, date: metric.date },
                update: { $set: metric },
                upsert: true,
              },
            })),
          );
        case MetricName.HEART_RATE:
          const hrMetrics = metrics as HeartRateMetric[];
          return HeartRateModel.bulkWrite(
            hrMetrics.map((metric) => ({
              updateOne: {
                filter: { source: metric.source, date: metric.date },
                update: { $set: metric },
                upsert: true,
              },
            })),
          );
        case MetricName.SLEEP_ANALYSIS:
          const sleepMetrics = metrics as SleepMetric[];
          return SleepModel.bulkWrite(
            sleepMetrics.map((metric) => ({
              updateOne: {
                filter: { source: metric.source, date: metric.date },
                update: { $set: metric },
                upsert: true,
              },
            })),
          );
        default:
          const baseMetrics = metrics as BaseMetric[];
          const model = createMetricModel(key as MetricName);
          return model.bulkWrite(
            baseMetrics.map((metric) => ({
              updateOne: {
                filter: { source: metric.source, date: metric.date },
                update: { $set: metric },
                upsert: true,
              },
            })),
          );
      }
    });

    await Promise.all(saveOperations);

    response.metrics = {
      success: true,
      message: `${metricsData.length} metrics saved successfully`,
    };

    return response;
  } catch (error) {
    console.error('Error saving metrics:', error);

    const errorResponse: IngestResponse = {};
    errorResponse.metrics = {
      success: false,
      error: error instanceof Error ? error.message : 'Error saving metrics',
    };

    return errorResponse;
  }
};
