/* eslint-disable playwright/expect-expect */
/* eslint-disable playwright/no-conditional-expect */
/* eslint-disable playwright/no-conditional-in-test */
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
if (process.argv.includes('--update-snapshots') && !process.env.SNAPSHOTS) {
	process.env.SNAPSHOTS = 'true';
}
const SNAPSHOTS = process.env.SNAPSHOTS === 'true';
const WORKFLOW_CONFIG_PATH = path.join(__dirname, 'workflowConfig.json');
const WORKFLOWS_DIR = path.join(__dirname, '../test-workflows/workflows');

// Global dynamic properties that apply to all workflows
const GLOBAL_DYNAMIC_PROPERTIES = ['startTime', 'executionTime', 'startedAt', 'stoppedAt'];

interface WorkflowConfig {
	workflowId: string;
	status: 'SKIPPED' | 'ACTIVE';
	enableSnapshots?: boolean;
	dynamicProperties?: string[];
}

/**
 * Legacy method to extract ignored properties from workflow node notes
 * Example:	"notes": "IGNORED_PROPERTIES=errors,values,is_developer,active,user_id",
 * @param content - The workflow content object
 * @returns Array of ignored property names
 */
function getLegacyIgnoredProperties(content: any): string[] {
	const ignoredProperties: string[] = [];
	if (content.nodes) {
		content.nodes.forEach((node: any) => {
			if (node.notes?.includes('IGNORED_PROPERTIES=')) {
				ignoredProperties.push(...node.notes.split('IGNORED_PROPERTIES=')[1].split(','));
			}
		});
	}
	return ignoredProperties;
}

/**
 * Load workflow configuration
 * @returns A map of workflow IDs to their config
 */
function getWorkflowConfig(): Map<string, WorkflowConfig> {
	if (!fs.existsSync(WORKFLOW_CONFIG_PATH)) return new Map();

	const configs: WorkflowConfig[] = JSON.parse(fs.readFileSync(WORKFLOW_CONFIG_PATH, 'utf-8'));
	return new Map(configs.map((config) => [config.workflowId, config]));
}

/**
 * Load workflows with their config
 * Will take care of ignored properties from the notes field in the workflow and from the config
 * @returns An array of workflow objects with their config
 */
function getWorkflowsWithConfig() {
	if (!fs.existsSync(WORKFLOWS_DIR)) return [];

	const workflowConfigs = getWorkflowConfig();

	return fs
		.readdirSync(WORKFLOWS_DIR)
		.filter((file) => file.endsWith('.json'))
		.map((file) => {
			const id = file.replace('.json', '');
			const content = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8'));
			const config = workflowConfigs.get(id);
			const ignoredProperties = getLegacyIgnoredProperties(content);

			return {
				id,
				name: content.name ?? `Workflow ${id}`,
				status: config?.status ?? 'ACTIVE',
				enableSnapshots: config?.enableSnapshots ?? true,
				dynamicProperties: [
					...GLOBAL_DYNAMIC_PROPERTIES,
					...(config?.dynamicProperties ?? []),
					...ignoredProperties,
				],
			};
		});
}

/**
 * Execute a workflow and return the result
 * @param workflowId - The ID of the workflow to execute
 * @returns The result of the workflow execution
 */
function executeWorkflow(workflowId: string) {
	const divider = '====================================';
	try {
		const stdout = execSync(`../../cli/bin/n8n execute --id="${workflowId}"`, {
			encoding: 'utf-8',
			maxBuffer: 10 * 1024 * 1024,
			env: { ...process.env, SKIP_STATISTICS_EVENTS: 'true' },
		});

		const dividerIndex = stdout.indexOf(divider);

		if (dividerIndex === -1) {
			return { success: stdout.includes('Execution was successful'), data: null };
		}

		const data = JSON.parse(stdout.substring(dividerIndex + divider.length));
		return { success: true, data };
	} catch (error: any) {
		const stdout = error.stdout ?? '';
		const dividerIndex = stdout.indexOf(divider);
		if (dividerIndex !== -1) {
			const errorDetails = stdout.substring(dividerIndex + divider.length).trim();
			return { success: false, data: null, error: errorDetails };
		}

		return { success: false, data: null, error: error.message };
	}
}

// Run tests
test.describe('Workflow Tests', () => {
	const workflows = getWorkflowsWithConfig();

	for (const workflow of workflows) {
		if (workflow.status === 'SKIPPED') {
			// eslint-disable-next-line playwright/no-skipped-test
			test.skip(`${workflow.name} (ID: ${workflow.id})`, () => {});
			continue;
		}

		test(`${workflow.name} (ID: ${workflow.id})`, ({}, testInfo) => {
			// Keep the snapshot name the same for all workflows, since it's not OS dependent
			testInfo.snapshotSuffix = '';
			const result = executeWorkflow(workflow.id);
			expect(result.success, result.error).toBe(true);
			if (SNAPSHOTS && workflow.enableSnapshots && result.data) {
				let dataForSnapshot = result.data;

				// Replace dynamic properties before snapshot comparison
				// They also get replaced before the snapshot is saved
				if (workflow.dynamicProperties.length > 0) {
					dataForSnapshot = replaceDynamicProperties(result.data, workflow.dynamicProperties);
				}

				expect(JSON.stringify(dataForSnapshot, null, 2)).toMatchSnapshot(
					`workflow-${workflow.id}.snap`,
				);
			}
		});
	}
});

// Helper function to replace dynamic properties with placeholder
function replaceDynamicProperties(data: any, propertiesToReplace: string[]): any {
	if (!data || typeof data !== 'object') return data;

	// Deep clone to avoid mutating original
	// eslint-disable-next-line n8n-local-rules/no-json-parse-json-stringify
	const cleaned = JSON.parse(JSON.stringify(data));

	// Recursively replace specified properties
	function replaceProperties(obj: any): any {
		if (Array.isArray(obj)) {
			return obj.map((item) => replaceProperties(item));
		}

		if (obj && typeof obj === 'object') {
			Object.keys(obj).forEach((key) => {
				if (propertiesToReplace.includes(key)) {
					obj[key] = 'DYNAMIC';
				} else {
					obj[key] = replaceProperties(obj[key]);
				}
			});
		}

		return obj;
	}

	return replaceProperties(cleaned);
}
