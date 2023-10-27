import { Configuration, OpenAIApi } from "openai";
import { encode } from "gpt-3-encoder";
import { updateTokenUsageAndCost } from "./scripts.js";
import { config } from "dotenv";
config();

// Available models and their configurations & cost
export const models = {
	gpt4: [
		{
			model: "gpt-4-32k",
			maxTokens: 32768,
			input_cost_per_1k: 0.06,
			output_cost_per_1k: 0.12,
		},
		{
			model: "gpt-4",
			maxTokens: 8192,
			input_cost_per_1k: 0.03,
			output_cost_per_1k: 0.06,
		},
	],
	gpt35: [
		{
			model: "gpt-3.5-turbo-16k",
			maxTokens: 16384,
			input_cost_per_1k: 0.003,
			output_cost_per_1k: 0.004,
		},
		{
			model: "gpt-3.5-turbo",
			maxTokens: 4096,
			input_cost_per_1k: 0.0015,
			output_cost_per_1k: 0.002,
		},
	],
	embeddings: [
		{
			model: "text-embedding-ada-002",
			maxTokens: 8191,
			cost_per_1k: 0.0001,
		},
	],
};

// Set up OpenAI API
const configuration = new Configuration({
	apiKey: process.env.openaiApiKey,
});
const openai = new OpenAIApi(configuration);

// Track token usage for every email
let track_token_usage = [
	{ model: "gpt-3.5-turbo-16k", input_tokens: 0, input_tokens_cost: 0, output_tokens: 0, output_tokens_cost: 0, cost: 0 },
	{ model: "gpt-3.5-turbo", input_tokens: 0, input_tokens_cost: 0, output_tokens: 0, output_tokens_cost: 0, cost: 0 },
	{ model: "gpt-4-32k", input_tokens: 0, input_tokens_cost: 0, output_tokens: 0, output_tokens_cost: 0, cost: 0 },
	{ model: "gpt-4", input_tokens: 0, input_tokens_cost: 0, output_tokens: 0, output_tokens_cost: 0, cost: 0 },
	{ model: "text-embedding-ada-002", total_tokens: 0, cost: 0 },
];

/**
 * Creates embeddings from the given prompt using a model.
 * @param {Object} model The model to be used to create embeddings.
 * @param {string} prompt The input prompt to create embeddings from.
 * @returns {Promise<Object[]>} A promise that resolves with an array of embeddings, or rejects with an error message if an error occurred.
 */
async function createEmbedding(model, prompt) {
	try {
		// Count the input tokens in the prompt using the 'countTokens' function
		const input_tokens = await countTokens(prompt);

		// Set output_tokens to 0, as this function does not use output tokens
		const output_tokens = 0;

		// Select the appropriate model from the model based on the input_tokens count
		const { model: gpt_model } = await selectModel(model, input_tokens);

		// Create embeddings by calling the OpenAI 'createEmbedding' method with the selected model and prompt
		const response = await openai.createEmbedding({
			model: gpt_model,
			input: prompt,
		});

		// Update token usage and cost using the 'updateTokenUsageAndCost' function
		await updateTokenUsageAndCost(track_token_usage, models, gpt_model, input_tokens, output_tokens)
			.then((updated_track_token_usage) => (track_token_usage = updated_track_token_usage))
			.catch((error) => {
				throw `Failed to update token usage. Error: ${error}`;
			});

		// Resolve the Promise with the array of embeddings for the prompt
		return response.data.data;
	} catch (error) {
		// Reject the Promise with the error to be handled by a calling function
		throw error;
	}
}

/**
 * Retrieves a response from the OpenAI API based on provided system and user prompts.
 *
 * @async
 * @param {Object} model - A reference to a GPT model.
 * @param {string} system_prompt - The system's message.
 * @param {string} user_prompt - The user's message.
 * @returns {Promise<string>} A promise that resolves to the generated answer from the OpenAI API.
 *
 * @throws {Error} Throws an error if unable to get a successful response after maximum retries or in case of an error in the OpenAI response.
 *
 * @description
 * This function first counts the number of input tokens in the prompt and selects an appropriate GPT model based on the token count.
 * It then enters a retry loop that attempts to get a response from the OpenAI API. If an error occurs, the function waits for an
 * increasing amount of time before retrying. If all retry attempts fail, the function throws the last encountered error.
 * After successfully getting a response, the function extracts the generated answer and updates the token usage and cost.
 */
async function getOpenAIResponse(model, system_prompt, user_prompt) {
	console.log("Waiting for openai response...");
	// Employing incremental backoff and retry system in case of openAI api error
	const MAX_RETRIES = 3; // Maximum number of retry attempts
	let waitTime = 1000; // Initial wait time in ms between retry attempts
	let lastError; // Variable to store the last encountered error

	// Get approx. number of input tokens for this prompt to determine which model to use
	const input_tokens = await countTokens(system_prompt + user_prompt);

	// Select the appropriate model from the model based on the input_tokens count
	let { model: gpt_model } = await selectModel(model, input_tokens);

	// Retry loop with a maximum of MAX_RETRIES attempts
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			if (lastError) console.log(`Retry attempt #${attempt + 1}`);
			// Make a request to the OpenAI API for chat completion using the selected model and prompt
			const completion = await openai.createChatCompletion({
				model: gpt_model,
				messages: [
					{ role: "system", content: system_prompt },
					{ role: "user", content: user_prompt },
				],
				temperature: 0,
			});

			// Extract the generated answer from the API response
			const answer = completion.data.choices[0].message.content;

			// Check if the answer contains an error and throw an error if it does
			if (answer.error) throw new Error(answer.error);

			// Update token usage and cost using the 'updateTokenUsageAndCost' function
			try {
				const updated_track_token_usage = await updateTokenUsageAndCost(
					track_token_usage,
					models,
					gpt_model,
					completion.data.usage.prompt_tokens,
					completion.data.usage.completion_tokens
				);
				track_token_usage = updated_track_token_usage;
			} catch (error) {
				console.error("Failed to update token usage and cost:", error);
			}

			return answer; // Return the generated answer
		} catch (error) {
			console.error(`Attempt ${attempt + 1} failed with error: ${error.message}`);
			lastError = error; // Store the last encountered error

			// If it's not the last attempt, add 2 seconds to wait time and wait before retrying
			waitTime += 3000;

			console.log(`Waiting ${waitTime / 1000} seconds...`);

			if (attempt < MAX_RETRIES - 1) await new Promise((resolve) => setTimeout(resolve, waitTime));
		}
	}

	// If all retry attempts have failed, throw the last encountered error
	console.error(`All attempts to get response from OpenAI API have failed. Last error: ${lastError}`);
	throw lastError;
}

/**
 * Selects an appropriate model based on the number of tokens.
 *
 * @param {Array} modelsGroup - An array of model objects, each having a model name and its maximum token limit.
 * @param {number} tokens - The number of tokens for which a model is to be selected.
 * @returns {Object} An object containing the selected model and its maximum token limit.
 *
 * @throws {Error} Throws an error if it fails to select a model.
 */
function selectModel(modelsGroup, tokens) {
	try {
		// Sort the models in the modelsGroup array based on their maxTokens value in ascending order
		let sortedModels = [...modelsGroup].sort((a, b) => a.maxTokens - b.maxTokens);

		// Find the first model in the sortedModels array whose maxTokens value is greater than or equal to 'tokens'
		let modelData = sortedModels.find((modelData) => tokens <= modelData.maxTokens);

		// If no suitable model is found (i.e., 'tokens' exceeds the maxTokens of all models), use the one with the highest token limit
		if (!modelData) modelData = modelsGroup.reduce((prev, current) => (prev.maxTokens > current.maxTokens ? prev : current));

		// Return an object containing the selected model and its max_tokens value
		return { model: modelData.model, max_tokens: modelData.maxTokens };
	} catch (error) {
		throw `Failed to select openai model: ${error}`;
	}
}

/**
 * Counts the number of tokens in a given prompt.
 *
 * @param {string} prompt - The prompt to count tokens from.
 * @returns {Promise<number>} A promise that resolves with the number of tokens in the prompt.
 *
 * @throws {string} Throws an error message if it fails to count tokens.
 */
async function countTokens(prompt) {
	try {
		// Encode the prompt to get its token representation
		const encoded = encode(prompt);

		// Return the length of the encoded string, which corresponds to the total number of tokens
		return encoded.length;
	} catch (error) {
		throw `Failed to count tokens: ${error}`;
	}
}

/**
 * Resets the token usage counter.
 *
 * @param {Array<Object>} track_token_usage - An array of objects each representing a token usage record. Each object property representing a number will be reset to zero.
 *
 * @throws {string} Throws an error message if the resetting process fails.
 */
async function resetTrackTokenUsage(track_token_usage) {
	console.log("Resetting token usage...");
	try {
		track_token_usage.forEach((item) => {
			for (let key in item) {
				if (typeof item[key] === "number") item[key] = 0; // Reset numerical properties to zero
			}
		});
	} catch (error) {
		throw `Failed to reset token usage: ${error}`;
	}
}

export { openai, track_token_usage, createEmbedding, getOpenAIResponse, resetTrackTokenUsage };
