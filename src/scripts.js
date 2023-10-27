import { retrievePineconeEmbeddings } from "./pinecone.js";
import { models } from "./openai.js";
import { qa_request, questions_json } from "./prompts.js";

/**
 * Asynchronously creates prompt strings.
 * This function generates system prompts, user prompts, and a preferred GPT model for a set of pre-defined questions.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of objects, each containing a system prompt, a user prompt, and a preferred GPT model.
 */
async function createPromptStrings() {
	const questions = {
		question_one: "Why did you start your business?",
		question_two: "What is your best-selling product/service?",
		question_three:
			"How many local businesses do you use to support your business (products and services) and can you name them?",
		question_four: "Have you 'reimagined' your small business?",
	};

	const promptObjects = Object.keys(questions).map(async (key) => {
		// Define the instructions for the agent
		const qa_instructions = `Use comprehension, inference, and context to determine what pieces of information belongs to the question: '${questions[key]}'.\nIf there are no answers to the question, just return 'No answers to this question'. Do not make up data. Remove nonsense text from answer.\nPrepare answer to be used in QA article.\nMake sure to identify the format how the user starts answering the questions, and make sure to completely extract answer between questions.\nIf you run into a list, make sure to properly format that list with comma.\nHyperlinks syntax: \'<a href="https://www.example.com/" target="_blank">example string</a>\'`;

		// Define the system prompt
		let system_prompt = `REQUEST: ${qa_request}\nINSTRUCTIONS: ${qa_instructions}\nJSON:${questions_json}`;

		// Retrieve the user prompt
		let user_prompt = await retrievePineconeEmbeddings(system_prompt, 1);

		// Define the preferred GPT model
		let preferred_gpt = models.gpt4;

		// Return the object containing the system prompt, user prompt, and preferred GPT model
		return {
			system_prompt,
			user_prompt,
			preferred_gpt,
		};
	});

	// Return the array of prompt objects when all promises have resolved
	return await Promise.all(promptObjects);
}

/**
 * Returns a Promise that resolves with the updated token usage and cost for the specified GPT model in the tracking array.
 * Rejects with an error if the specified GPT model is not found in the models object.
 * @param {Array} track_token_usage - An array containing usage and cost tracking objects for GPT models.
 * @param {Object} models - Object containing categories of GPT models and their respective details.
 * @param {string} gpt_model - The name of the GPT model to update token usage and cost for.
 * @param {number} input_tokens - The number of input tokens used in the request.
 * @param {number} output_tokens - The number of output tokens generated in the response.
 * @returns {Promise<Array>} - A Promise that resolves with the updated track_token_usage array after the modifications.
 */
function updateTokenUsageAndCost(track_token_usage, models, gpt_model, input_tokens, output_tokens) {
	return new Promise((resolve, reject) => {
		try {
			// First, identify which model is used by finding its category in the models object
			let modelCategory = null;
			for (let category in models) {
				if (models[category].some((entry) => entry.model === gpt_model)) {
					modelCategory = category;
					break;
				}
			}
			if (!modelCategory) throw new Error("Model not found");

			// Get the model's cost rates and maxTokens from the models object
			const modelInfo = models[modelCategory].find((entry) => entry.model === gpt_model);

			// Find the object to be updated in the track_token_usage array based on the GPT model
			const usageObject = track_token_usage.find((entry) => entry.model === gpt_model);

			// Update token counts based on whether it's an input or output
			if ("input_tokens" in usageObject && "output_tokens" in usageObject) {
				usageObject.input_tokens += input_tokens;
				usageObject.output_tokens += output_tokens;
			} else if ("total_tokens" in usageObject) {
				usageObject.total_tokens += input_tokens; // assuming input_tokens represent the total tokens for embeddings model
			}

			// Calculate costs and update based on the model's cost rates
			if ("input_cost_per_1k" in modelInfo && "output_cost_per_1k" in modelInfo) {
				usageObject.input_tokens_cost += input_tokens * (modelInfo.input_cost_per_1k / 1000);
				usageObject.output_tokens_cost += output_tokens * (modelInfo.output_cost_per_1k / 1000);
				usageObject.cost = usageObject.input_tokens_cost + usageObject.output_tokens_cost;
			} else if ("cost_per_1k" in modelInfo) {
				usageObject.cost += usageObject.total_tokens * (modelInfo.cost_per_1k / 1000);
			}

			// Resolve the updated track_token_usage array
			resolve(track_token_usage);
		} catch (error) {
			reject(error); // Call reject when there was an error
		}
	});
}

/**
 * Generates a usage report for the API based on the track_token_usage array.
 * @param {Array} track_token_usage - An array containing usage and cost tracking objects for GPT models.
 * @returns {Promise<string>} - A Promise that resolves to a formatted usage report as a string.
 */
function API_usage_report(track_token_usage) {
	return new Promise((resolve, reject) => {
		let totalCost = 0;
		let output = "";

		try {
			// Iterate through each element in the track_token_usage array
			track_token_usage.forEach((element) => {
				// Check if the model is the text-embedding-ada-002 model
				if (element.model === "text-embedding-ada-002") {
					// Append details for text-embedding-ada-002 model to the output
					output += `Model: ${element.model}, Total Tokens: ${element.total_tokens}, Cost: $${element.cost.toFixed(6)}\n`;
				} else {
					// Append details for other models to the output
					output += `Model: ${element.model}, Input Tokens: ${
						element.input_tokens
					}, Input Tokens Cost: $${element.input_tokens_cost.toFixed(6)}, Output Tokens: ${
						element.output_tokens
					}, Output Tokens Cost: $${element.output_tokens_cost.toFixed(6)}, Total Cost: $${element.cost.toFixed(6)}\n`;
				}

				// Add the cost of the current model to the total cost
				totalCost += element.cost;
			});

			// Convert the total cost to a fixed decimal format
			totalCost = totalCost.toFixed(6);

			// Append the total cost of all models to the output string
			output += `Total Cost of all models: $${totalCost}`;

			// Resolve the Promise with the formatted usage report as a string
			resolve(output);
		} catch (error) {
			// In case of an error, reject the Promise with the error object
			reject(error);
		}
	});
}

/**
 * Delays the execution by the specified time in milliseconds.
 * @param {number} ms - The delay time in milliseconds.
 * @returns {Promise} - A promise that resolves after the specified delay.
 */
function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export { createPromptStrings, updateTokenUsageAndCost, API_usage_report, delay };
