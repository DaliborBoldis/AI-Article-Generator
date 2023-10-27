import { getOpenAIResponse, resetTrackTokenUsage, track_token_usage } from "../openai.js";
import { ArchiveEmail } from "../imap.js";
import { API_usage_report } from "../scripts.js";
import { retrievePineconeEmbeddings } from "../pinecone.js";
import {
	ai_email_generator_instructions,
	ai_email_generator_JSON,
	getCategoryNominations,
	getBusinessDetails,
	qa_request,
} from "../prompts.js";
import { SaveData } from "../save_to_file.js";
import { getMissingNominationURL } from "../dynamic_agents/dynamic_agent.js";

/**
 * Creates a prompt for processing nomination emails based on the provided category data.
 *
 * @async
 * @param {Object} category - The category of the email to be processed, including an explanation for the category's use.
 * @returns {string} The generated prompt to be used with the AI model.
 */
async function createNominationsEmailPrompt(category) {
	const categoryNominations = getCategoryNominations();

	return `INSTRUCTIONS: ${categoryNominations.instructions}\nYour previous reasoning: ${category.explanation}\nJSON: ${categoryNominations.json}`;
}

/**
 * Creates a prompt for processing business details emails.
 *
 * @async
 * @returns {string} The generated prompt to be used with the AI model.
 */
async function createBusinessDetailsEmailPrompt() {
	const categoryBusinessDetails = getBusinessDetails();

	return `REQUEST: ${qa_request}\nINSTRUCTIONS:${categoryBusinessDetails.instructions}\nJSON: ${categoryBusinessDetails.json_minified}`;
}

/**
 * Asynchronously process nomination-related emails.
 * Includes generating responses, updating JSON files, and archiving processed emails.
 *
 * @async
 * @param {object} emailData - Contains data related to the email being processed.
 * @param {object} category - Category object containing information about the email category.
 * @throws Will throw an error if token usage resetting fails.
 */
async function process_nominations(emailData, category) {
	try {
		const { id, html, email, emailHeaders, attachments, uid } = emailData; // Destructure the emails object

		const system_prompt = createNominationsEmailPrompt(category);
		const user_prompt = await retrievePineconeEmbeddings(system_prompt, getCategoryNominations().top_k);

		console.log("Getting openai response for nominations...");
		const nominations = await getOpenAIResponse(getCategoryNominations().preferred_gpt, system_prompt, user_prompt);

		const parsed_response = JSON.parse(nominations);

		let nominations_object = { nominations: parsed_response };

		const bd_system_prompt = createBusinessDetailsEmailPrompt();
		let bd_user_prompt = await retrievePineconeEmbeddings(system_prompt, getBusinessDetails().top_k);

		const response = await getOpenAIResponse(getBusinessDetails().preferred_gpt, bd_system_prompt, bd_user_prompt);

		const bussines_details = JSON.parse(response);

		let business_details_object = { bussines_details: bussines_details };

		const updatedNominationsJSON = await processNominationsJSON(business_details_object, nominations_object);

		// Generate a thank you note for contact that provided nominations
		console.log("Getting openai response for thank you note...");

		const thankYouNote = generateThankYouLetter(category_nominations).catch((err) => {
			console.error(err);
		});

		let api_usage = await API_usage_report(track_token_usage).catch((error) =>
			console.error("Failed to generate usage report:", error)
		);

		let email_data = {
			api_usage,
			id,
			html,
			attachments,
			email: JSON.stringify(email),
			emailHeaders: JSON.stringify(emailHeaders),
			NominationsJSON: JSON.stringify(updatedNominationsJSON),
			ThankYouResponse: JSON.stringify(thankYouNote),
			category: JSON.stringify(category),
		};

		await SaveData(email_data);

		await resetTrackTokenUsage(track_token_usage);

		await ArchiveEmail(uid);
	} catch (error) {
		console.error(error);

		// Reset API usage tracker
		await resetTrackTokenUsage(track_token_usage).catch((err) => {
			throw new Error("Failed to reset token variable: " + err);
		});
	}
}

/**
 * Asynchronously generates a thank you note for nominations using OpenAI's GPT model.
 *
 * @async
 * @param {object} category_nominations - Category object containing information about the email category and the necessary instructions.
 * @returns {Promise<string>} Returns a promise that resolves to a string containing the generated thank you note.
 * @throws {string} Will throw an error if generating a thank you note fails.
 */
async function generateThankYouLetter(category_nominations) {
	try {
		let thankYouNote_system_prompt = `INSTRUCTIONS: ${ai_email_generator_instructions}\n${category_nominations.thankYouNoteInstructions}\nJSON: ${ai_email_generator_JSON}`;

		return await getOpenAIResponse(category_nominations.preferred_gpt, thankYouNote_system_prompt, JSON.stringify(email));
	} catch (error) {
		throw `Failed to generate a thank you note: ${error}`;
	}
}

/**
 * Asynchronously processes nominations JSON data. For each nomination, if there are missing business details, this function will call other functions to fetch the necessary details.
 * Then, generates an interview invitation letter for each nomination.
 *
 * @async
 * @param {object} businessDetails_Object - An object containing business details fetched from OpenAI.
 * @param {object} nominations_json - An object containing nominations data.
 * @returns {Promise<object>} Returns a promise that resolves to the processed nominations JSON object.
 * @throws {string} Will throw an error if it fails to fetch the missing business URL from LLM agent or to generate the 'Invitation to interview' letter.
 */
async function processNominationsJSON(businessDetails_Object, nominations_json) {
	console.log("Entering process nominations json func");
	try {
		const promises = []; // Initialize an empty array for promises

		for (const outerKey of Object.keys(nominations_json)) {
			for (const innerKey of Object.keys(nominations_json[outerKey])) {
				const nomination = nominations_json[outerKey][innerKey];

				if (!nomination.nominated_business_name) continue;

				if (!nomination.nominated_business_location) {
					// If there's no town, skip this nomination
					if (!businessDetails_Object.bussines_details.town) continue;

					if (businessDetails_Object.bussines_details.town)
						nomination.nominated_business_location = businessDetails_Object.bussines_details.town;
				}

				if (!nomination.nominated_business_link) {
					console.log("Asking agent to provide missing nominations URLs...");
					let searchQuery = `${nomination.nominated_business_name} ${nomination.nominated_business_location}`;
					let linkPromise = getMissingNominationURL(searchQuery);
					promises.push(linkPromise); // Push the promise into the array
					nomination.nominated_business_link = await linkPromise;
				}

				let invitationPromise = generateInvitationToInterviewLetter(businessDetails_Object.bussines_details, nomination);
				promises.push(invitationPromise); // Push the promise into the array
				nomination.email_template = await invitationPromise;
			}
		}

		await Promise.allSettled(promises); // Now we wait for all the promises to be settled
	} catch (error) {
		console.error("Failed to get missing business URL from LLM agent or to generate 'Invitation to interview' note: ", error);
	}

	return nominations_json;
}

/**
 * Asynchronously generates an interview invitation letter for a given nomination, based on business details.
 *
 * @async
 * @param {object} businessDetails - An object containing business details fetched from OpenAI.
 * @param {object} nomination - An object containing a single nomination data.
 * @returns {Promise<object>} Returns a promise that resolves to an object containing the subject and message body of the interview invitation letter.
 */
async function generateInvitationToInterviewLetter(businessDetails, nomination) {
	const emailOwnerName = "Dan";
	const defaultTown = "Ridgefield";

	const getGreeting = () => `Hello ${nomination.nominated_business_person || "!"}`;

	const getTown = () => nomination.town || businessDetails.town || defaultTown;

	const getIntro = () => {
		if (businessDetails.senderName && businessDetails.businessName)
			return `${businessDetails.senderName} from ${businessDetails.businessName}`;

		return `${businessDetails.senderName || businessDetails.businessName + " team"}`;
	};

	const getGenderPronoun = () =>
		businessDetails.senderGender === "Female" ? "her" : businessDetails.senderGender === "Male" ? "his" : "their";

	const getThankfulNote = () => {
		const senderName = businessDetails.senderName;
		const businessName = businessDetails.businessName;
		const pronoun = getGenderPronoun();

		return senderName
			? `${senderName} was very thankful for the opportunity to showcase ${pronoun} business, and was very happy to nominate you to participate next!`
			: `${businessName} team was very thankful for the opportunity to showcase their business, and were very happy to nominate you to participate next!`;
	};

	const subject = `Invitation to interview - hamlethub.com and ${businessDetails.businessName}`;
	const message = `
${getGreeting()}
My name is ${emailOwnerName} from the Hamlethub.com website - a local news provider in ${getTown()}.
${getIntro()} asked us to reach out to you to check if you're willing to participate in an online interview that we're running in ${getTown()}. ${getThankfulNote()}
The interview process is completely online, and you can reply with your answers to the following questions:\n
- Why did you start your business?
- What is your best-selling product/service?
- How many local businesses do you use to support your business (products and services) and can you name them?
- Have you "reimagined" your small business?\n
Please let me know if you have any questions or if you need any help! Locally yours,
${emailOwnerName}
`;

	return { subject, message };
}

export { processNominationsJSON, process_nominations };
