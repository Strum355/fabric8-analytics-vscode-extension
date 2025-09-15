import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionToggle,
  Card,
  CardBody,
  CardTitle,
  Gallery,
  GalleryItem,
  Masthead,
  Page,
  PageSection,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  ExpandableRowContent,
} from '@patternfly/react-table';
import {
  Chart,
  ChartAxis,
  ChartBar,
  ChartThemeColor,
  ChartVoronoiContainer,
} from '@patternfly/react-charts/victory';
import { useEffect, JSX, useState, useMemo } from 'react';

import { createRoot } from 'react-dom/client';
import { ModelCardResponse } from './llmAnalysis';
import 'vscode-webview';

const vscode = window.acquireVsCodeApi?.();

// Function to fetch model card data via message passing
function fetchModelCardData(
  modelID: string
): Promise<ModelCardResponse | undefined> {
  return new Promise((resolve) => {
    if (!vscode) {
      resolve(undefined);
      return;
    }

    const requestId = Math.random().toString(36).substring(7);

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (
        message.command === 'modelCardResponse' &&
        message.requestId === requestId
      ) {
        window.removeEventListener('message', handleMessage);
        if (message.success) {
          resolve(message.data);
        } else {
          console.error('Error fetching model card:', message.error);
          resolve(undefined);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Send request
    vscode.postMessage({
      command: 'fetchModelCard',
      modelID,
      requestId,
    });
  });
}

interface ReportData {
  modelName: string;
  modelSource: string;
  modelRevision: string;
  dtype: string;
  batchSize: string;
  transformersVersion: string;
  lmEvalVersion: string;
  taskData: {
    taskName: string;
    desc: string;
    tags: string;
    metrics: {
      name: string;
      score: number;
      categories: string[];
      higherIsBetter: boolean;
      impactLevel: string;
      impactDisplayName: string;
      relatedGuardrails: ({
        id: number;
        name: string;
      } | null)[];
    }[];
  }[];
  metricsData: {
    impactLevel: string;
    impactDisplayName: string;
    name: string;
    value: number;
  }[];
  impactLevels: string[];
  impactDisplayNames: string[];
  guardrails: {
    improvedMetrics: {
      taskName: string;
      metricName: string;
    }[];
    id: number;
    name: string;
    type: string;
    description: string;
    instructions: string;
    categories: string[];
    externalReferences: string[];
  }[];
}

interface EnrichedGuardrail {
  id: number;
  name: string;
  type: string;
  description: string;
  instructions: string;
  categories: string[];
  externalReferences: string[];
  improvedMetrics: Array<{ taskName: string; metricName: string }>;
}

function getImpactLevel(
  metric: ModelCardResponse['tasks'][0]['metrics'][0]
): string {
  if (!metric.thresholds || metric.thresholds.length === 0) {
    return 'unknown';
  }

  const score = metric.score;
  for (const threshold of metric.thresholds) {
    if (score >= threshold.lower && score <= threshold.upper) {
      return threshold.impact;
    }
  }
  return 'unknown';
}

// function getImpactColor(impactLevel: string): string {
//   switch (impactLevel) {
//     case 'no_measurable':
//       return '#C8E6C9'; // Visible light green
//     case 'very_low':
//       return '#26A69A'; // Blue-green
//     case 'low':
//       return '#8BC34A'; // Light green
//     case 'moderate':
//       return '#FF9800'; // Orange
//     case 'high':
//       return '#FF5722'; // Red-orange
//     case 'severe':
//       return '#F44336'; // Red
//     default:
//       return '#9E9E9E'; // Gray
//   }
// }

function getImpactDisplayName(impactLevel: string): string {
  switch (impactLevel) {
    case 'no_measurable':
      return 'No Measurable Impact';
    case 'very_low':
      return 'Very Low';
    case 'low':
      return 'Low';
    case 'moderate':
      return 'Moderate';
    case 'high':
      return 'High';
    case 'severe':
      return 'Severe';
    default:
      return 'Unknown';
  }
}

function getRecommendedGuardrails(
  tasks: ModelCardResponse['tasks'],
  apiGuardrails: ModelCardResponse['guardrails']
): EnrichedGuardrail[] {
  // Collect all guardrail IDs from metrics that have high or moderate impact
  const recommendedGuardrailIds = new Set<number>();

  tasks.forEach((task) => {
    task.metrics.forEach((metric) => {
      const impactLevel = getImpactLevel(metric);
      if (impactLevel === 'high' || impactLevel === 'moderate') {
        if (metric.guardrails) {
          metric.guardrails.forEach((id: number) =>
            recommendedGuardrailIds.add(id)
          );
        }
      }
    });
  });

  // Create guardrail-to-metrics mapping for cross-references
  const guardrailToMetrics = new Map<
    number,
    Array<{ taskName: string; metricName: string }>
  >();

  tasks.forEach((task) => {
    task.metrics.forEach((metric) => {
      if (metric.guardrails) {
        metric.guardrails.forEach((id) => {
          if (!guardrailToMetrics.has(id)) {
            guardrailToMetrics.set(id, []);
          }
          guardrailToMetrics.get(id)!.push({
            taskName: task.name,
            metricName: metric.name,
          });
        });
      }
    });
  });

  // Filter API guardrails to only include recommended ones
  return apiGuardrails
    .filter((guardrail) => recommendedGuardrailIds.has(guardrail.id))
    .map(
      (guardrail): EnrichedGuardrail => ({
        id: guardrail.id,
        name: guardrail.name,
        type: guardrail.scope === 'both' ? 'input_output' : guardrail.scope,
        description: guardrail.description,
        instructions: guardrail.instructions,
        categories: guardrail.metadata_keys || [],
        externalReferences: guardrail.external_references || [],
        improvedMetrics: guardrailToMetrics.get(guardrail.id) || [],
      })
    );
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function LLMAnalysisReportPage(props: { modelID: string }): JSX.Element {
  const [modelCardResponse, setModelCardResponse] = useState(
    undefined as ModelCardResponse | undefined
  );

  useEffect(() => {
    fetchModelCardData(props.modelID).then((response) => {
      setModelCardResponse(response);
    });
  }, [props.modelID]);

  const reportData = useMemo((): ReportData | undefined => {
    if (!modelCardResponse) {
      return undefined;
    }

    // Collect all metrics with their impact levels
    const allMetrics = modelCardResponse.tasks.flatMap((task) =>
      task.metrics.map((metric) => ({
        task,
        metric,
        label: `${task.name}: ${metric.name}`,
        impactLevel: getImpactLevel(metric),
      }))
    );

    // Sort by required metrics first, then by impact level
    allMetrics.sort((a, b) => {
      const impactOrder: { [key: string]: number } = {
        severe: 0,
        high: 1,
        moderate: 2,
        low: 3,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        very_low: 4,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        no_measurable: 5,
        unknown: 6,
      };
      return impactOrder[a.impactLevel] - impactOrder[b.impactLevel];
    });

    const recommendedGuardrails = getRecommendedGuardrails(
      modelCardResponse.tasks,
      modelCardResponse.guardrails
    );

    // Create metric-to-guardrail and guardrail-to-metric mappings
    const metricToGuardrails = new Map<string, number[]>();
    const guardrailToMetrics = new Map<
      number,
      Array<{ taskName: string; metricName: string }>
    >();

    modelCardResponse.tasks.forEach((task) => {
      task.metrics.forEach((metric) => {
        const metricKey = `${task.name}:${metric.name}`;

        if (metric.guardrails) {
          metricToGuardrails.set(metricKey, metric.guardrails);

          metric.guardrails.forEach((id) => {
            if (!guardrailToMetrics.has(id)) {
              guardrailToMetrics.set(id, []);
            }
            guardrailToMetrics.get(id)!.push({
              taskName: task.name,
              metricName: metric.name,
            });
          });
        }
      });
    });

    // Add cross-references to guardrails
    const enrichedGuardrails = recommendedGuardrails.map((guardrail) => ({
      ...guardrail,
      improvedMetrics: guardrailToMetrics.get(guardrail.id) || [],
    }));

    // Add guardrail info to tasks and metrics
    const enrichedTasks = modelCardResponse.tasks.map((task) => ({
      // key needs to be not `name` as mustache doesn't let us reference parent scope explicitly
      taskName: task.name,
      desc: task.description,
      tags: task.tags?.join(', ') || '',
      metrics: task.metrics.map((metric) => {
        const metricKey = `${task.name}:${metric.name}`;
        const relatedGuardrailIds = metricToGuardrails.get(metricKey) || [];

        return {
          name: metric.name,
          score: metric.score,
          categories: metric.categories,
          higherIsBetter: metric.higher_is_better,
          impactLevel: getImpactLevel(metric),
          impactDisplayName: getImpactDisplayName(getImpactLevel(metric)),
          relatedGuardrails: relatedGuardrailIds
            .filter((id) => recommendedGuardrails.some((g) => g.id === id))
            .map((id) => {
              const guardrail = modelCardResponse.guardrails.find(
                (g) => g.id === id
              );
              return guardrail
                ? { id: guardrail.id, name: guardrail.name }
                : null;
            })
            .filter(Boolean),
        };
      }),
    }));

    return {
      modelName: modelCardResponse.config.model_name,
      modelSource: modelCardResponse.config.model_source,
      modelRevision: modelCardResponse.config.model_revision_sha
        .replace('sha256:', '')
        .substring(0, 8),
      dtype: modelCardResponse.config.dtype,
      batchSize: modelCardResponse.config.batch_size,
      transformersVersion: modelCardResponse.config.transformers_version,
      lmEvalVersion: modelCardResponse.config.lm_eval_version,
      impactLevels: Array.from(new Set(allMetrics.map((m) => m.impactLevel))),
      impactDisplayNames: Array.from(
        new Set(allMetrics.map((m) => getImpactDisplayName(m.impactLevel)))
      ),
      taskData: enrichedTasks,
      metricsData: enrichedTasks.flatMap((task) =>
        task.metrics.map((metric) => ({
          impactLevel: metric.impactLevel,
          impactDisplayName: metric.impactDisplayName,
          name: metric.name,
          value: metric.score,
        }))
      ),
      guardrails: enrichedGuardrails,
    };
  }, [modelCardResponse]);

  const [expandedGuardrail, setExpandedGuardrail] = useState('');
  const onToggleExpandGuardrail = (id: string) => {
    if (id === expandedGuardrail) {
      setExpandedGuardrail('');
    } else {
      setExpandedGuardrail(id);
    }
  };

  const [expandedTaskDetails, setExpandedTaskDetails] = useState('');
  const onToggleExpandedTaskDetails = (id: string) => {
    if (id === expandedTaskDetails) {
      setExpandedTaskDetails('');
    } else {
      setExpandedTaskDetails(id);
    }
  };

  return reportData ? (
    <Page masthead={<Masthead />}>
      <PageSection>
        <h1 className="pf-v6-u-font-weight-bold pf-t--global--font--size--heading--h1 pf-v6-u-font-size-4xl">
          Red Hat LLM Analysis Report
        </h1>
        <p>TrustyAI LLM Eval results for {reportData.modelName}</p>
      </PageSection>

      <PageSection>
        <Card isFullHeight isLarge>
          <CardTitle>Report Context</CardTitle>
          <CardBody>
            <Gallery hasGutter>
              <GalleryItem>
                <div className="pf-v6-u-font-weight-bold">Model source</div>
                <div>{reportData.modelSource}</div>
              </GalleryItem>
              <GalleryItem>
                <div className="pf-v6-u-font-weight-bold">Model revision</div>
                <div>{reportData.modelRevision}</div>
              </GalleryItem>
              <GalleryItem>
                <div className="pf-v6-u-font-weight-bold">Data type</div>
                <div>{reportData.dtype}</div>
              </GalleryItem>
              <GalleryItem>
                <div className="pf-v6-u-font-weight-bold">Batch size</div>
                <div>{reportData.batchSize}</div>
              </GalleryItem>
              <GalleryItem>
                <div className="pf-v6-u-font-weight-bold">
                  Transformers version
                </div>
                <div>{reportData.transformersVersion}</div>
              </GalleryItem>
              <GalleryItem>
                <div className="pf-v6-u-font-weight-bold">LM-Eval version</div>
                <div>{reportData.lmEvalVersion}</div>
              </GalleryItem>
              <GalleryItem>
                <div className="pf-v6-u-font-weight-bold">Github link</div>
                <a href="https://github.com/trustification/red-hat-dependency-analytics/issues/1">
                  https://github.com/trustification/red-hat-dependency-analytics/issues/1
                </a>
              </GalleryItem>
            </Gallery>
          </CardBody>
        </Card>
      </PageSection>

      <PageSection>
        <Card isFullHeight isLarge>
          <CardTitle>Priority safety metrics</CardTitle>
          <CardBody>
            <Chart
              containerComponent={
                <ChartVoronoiContainer
                  labels={({ datum }) => `${datum.name}: ${datum.y}`}
                  constrainToVisibleArea
                />
              }
              legendPosition="bottom-left"
              themeColor={ChartThemeColor.multi}
              horizontal
              domain={{ y: [0, 1] }}
              legendData={reportData.impactDisplayNames.map((level) => ({
                name: level,
              }))}
              padding={{
                bottom: 100,
                left: 50,
                right: 50,
                top: 50,
              }}
            >
              <ChartAxis />
              <ChartAxis dependentAxis showGrid />
              <ChartBar
                data={reportData.metricsData.map((data) => {
                  return {
                    name: data.impactDisplayName,
                    y: data.value,
                    x: data.name,
                  };
                })}
              />
            </Chart>
          </CardBody>
        </Card>
      </PageSection>

      <PageSection>
        <Card isFullHeight isLarge>
          <CardTitle>Evaluation task details</CardTitle>
          <CardBody>
            <Table isExpandable>
              <Thead>
                <Tr>
                  <Th screenReaderText="Row expansion" />
                  <Th>Task Name</Th>
                  <Th>Description</Th>
                  <Th>Tags</Th>
                  {/* <Th>Actions</Th> */}
                </Tr>
              </Thead>
              {reportData.taskData.map((task, rowIdx) => (
                <Tbody
                  isExpanded={expandedTaskDetails === `task-details-${rowIdx}`}
                >
                  <Tr
                    key={task.taskName}
                    isContentExpanded={
                      expandedTaskDetails === `task-details-${rowIdx}`
                    }
                  >
                    <Td
                      expand={{
                        rowIndex: rowIdx,
                        isExpanded:
                          expandedTaskDetails === `task-details-${rowIdx}`,
                        onToggle: () => {
                          onToggleExpandedTaskDetails(`task-details-${rowIdx}`);
                        },
                      }}
                    >
                      {task.taskName}
                    </Td>
                    <Td>{task.desc}</Td>
                    <Td>{task.tags}</Td>
                  </Tr>
                  <Tr
                    isExpanded={
                      expandedTaskDetails === `task-details-${rowIdx}`
                    }
                  >
                    <Td colSpan={4}>
                      <ExpandableRowContent>
                        <Table variant="compact">
                          <Thead>
                            <Tr>
                              <Th>Metric</Th>
                              <Th>Score</Th>
                              <Th>Impact</Th>
                              <Th>Categories</Th>
                              <Th>Guardrails</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {task.metrics.map((metric, metricIdx) => (
                              <Tr
                                key={`${task.taskName}-${metric.name}-${metricIdx}`}
                              >
                                <Td>{metric.name}</Td>
                                <Td>{metric.score.toFixed(3)}</Td>
                                <Td>{metric.impactDisplayName}</Td>
                                <Td>{metric.categories.join(', ')}</Td>
                                <Td>
                                  {metric.relatedGuardrails.length > 0
                                    ? metric.relatedGuardrails
                                        .map((guardrail) => guardrail?.name)
                                        .filter(Boolean)
                                        .join(', ')
                                    : 'None'}
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </ExpandableRowContent>
                    </Td>
                  </Tr>
                </Tbody>
              ))}
            </Table>
          </CardBody>
        </Card>
      </PageSection>

      <PageSection>
        <Card isFullHeight isLarge>
          <CardTitle>Recommended safety guardrails</CardTitle>
          <CardBody>
            <p>
              Based on the evaluation results, we recommend implementing the
              following guardrails to address identified safety concerns:
            </p>
            <Accordion asDefinitionList={false}>
              {reportData.guardrails.map((guardrail) => (
                <AccordionItem
                  key={`guardrail-item-${guardrail.id}`}
                  isExpanded={
                    expandedGuardrail === `guardrail-toggle-${guardrail.id}`
                  }
                >
                  <AccordionToggle
                    onClick={() => {
                      onToggleExpandGuardrail(
                        `guardrail-toggle-${guardrail.id}`
                      );
                    }}
                    id={`guardrail-toggle-${guardrail.id}`}
                  >
                    {guardrail.name}
                  </AccordionToggle>
                  <AccordionContent id={`guardrail-expand-${guardrail.id}`}>
                    <p>{guardrail.description}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardBody>
        </Card>
      </PageSection>
    </Page>
  ) : (
    <>
      <PageSection>
        <h1 className="pf-v6-u-font-weight-bold pf-t--global--font--size--heading--h1 pf-v6-u-font-size-4xl">
          Loading LLM data...
        </h1>
      </PageSection>
    </>
  );
}

const container = document.getElementById('root')!;
const modelID = container.getAttribute('model-id')!;
const root = createRoot(container);
root.render(<LLMAnalysisReportPage modelID={modelID} />);
