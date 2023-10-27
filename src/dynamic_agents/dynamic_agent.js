import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { OpenAI } from "langchain/llms/openai";
import { config } from "dotenv";
import getTool from "./agent_tools.js";

config();
// Regular expression to extract URLs
const urlRegex = /(https?:\/\/[^\s]+)/g;

/**
 * Updates business details object based on the agent output.
 * @param {string} agentOutput - Agent output from which URLs are extracted.
 * @param {Object} businessDetails - Business details to be updated.
 * @returns {Object} The updated business details object.
 */
function updateBusinessDetails(agentOutput, businessDetails) {
	const urls = agentOutput.match(urlRegex);
	if (urls) {
		urls.forEach((url) => {
			url = url.replace(/[.,]$/, "");

			// Removes "//" from the URL to facilitate matching of URL with social media domains,
			// but leaves the "//" in "https://"
			url = url.replace(/([^:])\/\//g, "$1/");

			// Assigns the URL to the corresponding field in business details object based on the social media domain in the URL.
			if (url.includes("facebook.com")) businessDetails.bussines_details.facebook = url;
			if (url.includes("twitter.com")) businessDetails.bussines_details.twitter = url;
			if (url.includes("instagram.com")) businessDetails.bussines_details.instagram = url;
			if (url.includes("linkedin.com")) businessDetails.bussines_details.linkedin = url;

			// Assigns the URL to the website field in the business details object, only if it's not already assigned.
			if (!businessDetails.bussines_details.website) businessDetails.bussines_details.website = url;
		});
	}

	return businessDetails;
}

/**
 * Asynchronously retrieves missing business details.
 * This function uses an agent to find missing business details and updates the business details object accordingly.
 * @param {Object} business_details_object - The object that contains existing business details.
 * @returns {Promise<Object>} A promise that resolves to the updated business details object.
 * @throws Will throw an error if there's an issue during the execution of the agent or if the updating of business details fails.
 */
async function getMissingBusinessDetails(business_details_object) {
	try {
		// Build the input string for the executor using the business details
		const input = `Find missing details about this company '${business_details_object.bussines_details.businessName}, ${business_details_object.bussines_details.town}'. Website: "${business_details_object.bussines_details.website}", Facebook: "${business_details_object.bussines_details.facebook}", Twitter: "${business_details_object.bussines_details.twitter}", Instagram: "${business_details_object.bussines_details.instagram}".`;

		// Run the agent using the input and then update the business details object with the agent output
		const agentOutput = await runAgent(input, 0.2, "google_search", "link_parser");

		return updateBusinessDetails(agentOutput, business_details_object);
	} catch (error) {
		console.error(`Failed to get missing details about the company: ${error}`);
	}
}

/**
 * Asynchronously retrieves a missing nomination URL for a business.
 * This function uses an agent to find the nomination URL and returns the first URL found or an empty string if none are found.
 * @param {string} search_query - The query used to find the business.
 * @returns {Promise<string>} A promise that resolves to the found URL or an empty string.
 * @throws Will throw an error if there's an issue during the execution of the agent.
 */
async function getMissingNominationURL(search_query) {
	console.log(search_query);
	try {
		const input = `Find website or social media link for this business: '${search_query}'\nIf you can't find link, return 'No data'.`;

		// Run the agent using the input
		const agentOutput = await runAgent(input, 0.2, "google_search", "web_browser");

		// Extract URLs from the agent output
		const urls = agentOutput.match(urlRegex);

		// Return the first found URL or an empty string if no URLs are found
		const result = urls && urls.length > 0 ? urls[0] : "";

		return result;
	} catch (error) {
		console.error(`Failed to get missing nomination URL: ${error}`);
	}
}

/**
 * Asynchronously runs an agent with specific tools.
 * This function initializes an agent executor with the provided tools and model and executes the agent with a given input.
 * @param {string} input - The input for the agent executor.
 * @param {number} temp - The temperature for the OpenAI model.
 * @param {...string} toolNames - The names of the tools to use with the agent executor.
 * @returns {Promise<string>} A promise that resolves to the output of the agent execution.
 * @throws Will throw an error if the initialization or execution of the agent fails.
 * ! There is still no way to track token usage with 'zero-shot-react-description' agents
 */
async function runAgent(input, temp, ...toolNames) {
	try {
		// Initialize the OpenAI model with the provided API key and temperature
		const model = new OpenAI({ openAIApiKey: process.env.openaiApiKey, temperature: temp });

		// Get the tools to use with the agent executor
		const tools = toolNames.map((name) => getTool(name));

		// Initialize the agent executor with the tools and model
		const executor = await initializeAgentExecutorWithOptions(tools, model, {
			agentType: "zero-shot-react-description",
			verbose: false,
			handle_parsing_errors: true,
		});

		// Execute the agent with the input
		const result = await executor.call({ input });

		console.log("Agent returned following data: " + JSON.stringify(result));

		// Return the agent output
		return JSON.stringify(result.output);
	} catch (error) {
		console.error(`Agent failed with error: ${error}`);
	}
}

export { getMissingBusinessDetails, getMissingNominationURL };
