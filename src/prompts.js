import { models } from "./openai.js";

const email_owner_name = "Dan Boldis";

const qa_request = `Extract data from the context and fill in the blank in the provided object. Make sure to escape special characters in your output. No explanations. If you cannot provide an answer, leave it blank. Carefully follow instructions.`;
const questions_json = `{ "q": "", "a": "" }`;

const generate_keywords = `Generate 6 keywords from answers with hashtags that perfectly describes this business, and avoid using #local #business #shop hashtags or other businesses names and locations. Output only hashtags one after another.`;
const keywords_template = `# # # # # #`;

const ai_email_generator_instructions = `Act as an AI-powered Professional Email Generator, your task is to craft clear and concise emails tailored to the question or concern in email. The generator should possess the ability to understand the purpose and tone of the email, whether it be a formal business proposal, a follow-up message, or a professional introduction. Automatically format the email in a professional manner including the greeting, body, and closing. Additionally, you should provide a strong and attention-grabbing subject line, and personalize the email by using the recipient's name and other relevant information. You will assist in saving time and increasing email productivity while maintaining a professional image. Follow general guidelines for responding to customer emails based on best practices. Your name is ${email_owner_name}, and your email domain is either hamletmail.com or hamlethub.com. If there are previous messages attached to the email, use that info to figure out the whole conversation between ${email_owner_name} and the customers. Do not print signature details at the end of your response, only your name.`;
const ai_email_generator_JSON = `{ "subject": "Subject line", "message": "Generated message" }`;

const getCategorizeEmailPrompt = () => ({
	instructions: `Categorize email into provided JSON based on the following categories and their explanations:
	{
	  "Answers": "Emails that fall into this category include responses with answers to the questions posed in our campaign. These responses typically provide answers to the following questions: Why did you start your business? What is your best-selling product/service? How many local businesses do you use to support your business (products and services) and can you name them? Have you "reimagined" your small business? These answers are part of the core data our campaign seeks to gather. Answers category have priority over all other categories if conditions are met.",
	  "Nominations": "If a business nominates another business or businesses to be featured in our campaign, it falls under this category. This process helps to find more businesses that can be part of our campaign, expanding our network and impact. The nominations category has priority over other categories (except the Answers category) if conditions are met.",
	  "Questions": "This category is for emails where the sender has asked a direct question or raised a query. The question may be related to campaign, asking for clarification on the process, or inquiring about other details. These emails require a response that provides the information or clarification sought by the sender.",
	  "Unsubscribe request": "This category includes any emails where the sender has expressed a desire to stop receiving emails or to be removed from our campaign. It's important to identify these promptly to respect the sender's wishes and maintain good relationships. If there is an option to unsubscribe, that does not mean you should categorize emails as unsubscribe request.",
	  "Acknowledgment": "Emails that express appreciation, gratitude, or acknowledgment for something we have done fall into this category. They might be thanking you for featuring their business, appreciating your efforts, or acknowledging receipt of a previous email.",
	  "Confirmation": "These emails are sent in response to a specific request or query we made, confirming some piece of information. For example, confirming the logo to be used, agreeing to an interview, or confirming that they received your email. These are often follow-up emails that indicate the sender has accepted a request or agreed to an action.",
	  "Decline to Participate": "This category includes emails where the sender directly expresses that they do not wish to participate in your campaign. They may state various reasons, such as lack of time, misalignment with their business goals, or other personal reasons. Recognizing and categorizing these emails is important to ensure that you respect their decision and do not further engage them in the campaign."
	  "Spam or Promotion": "Emails that fall under this category are usually unsolicited and promote a product, service, or offer that's not directly related to our campaign. They may include sales pitches, promotional offers, or advertisements from businesses that are not part of the 'Why Small Businesses Matter' campaign. These emails can be considered as 'noise' and can be filtered out when processing our campaign responses."
	}

	You cannot combine categories.

	Output only JSON in the provided format.
	
	No reasoning is needed in the output besides updated JSON with category and your reasoning.`,
	json: `{ "category": "Appropriate category", "explanation": "Your reasoning" }`,
	preferred_gpt: models.gpt4,
	top_k: 2,
});

const getBusinessDetails = () => ({
	instructions: "Parse business details from email body.",
	json: `{
	  "senderName": "", // Full sender name. Must be name and surname
	  "senderGender": "", // 'Male', 'Female' or 'Unknown'
	  "senderTitle": "", // Put only Owner, Founder, Manager, CEO, etc...
	  "businessName": "", // Remove LLC, Inc, and similar business structure words from business name
	  "address": "", // Full address
	  "town": "", // Format: {TOWN, STATE}. Leave blank if unsure. You can learn this information from body and subject.
	  "phoneNumber": "", // Format: (000)000-000
	  "website": "", // Add http(s)://www...
	  "facebook": "", // When adding a username to social media links, please ensure to use the full URL. For example, if the Instagram username is '@exampleprofile', please use 'https://www.instagram.com/exampleprofile' instead. Similarly, for other social media platforms, use their respective URL structures
	  "twitter": "",
	  "instagram": "",
	  "linkedin": ""
		}`,
	json_minified: `{
			"senderName": "", // Full sender name. Must be name and surname
			"senderGender": "", // 'Male', 'Female' or 'Unknown'
			"businessName": "", // Remove LLC, Inc, and similar business structure words from business name
			"town": "" // Format: {TOWN, CT}. Leave blank if unsure. You can learn this information from body and subject.
		}`,
	preferred_gpt: models.gpt4,
	top_k: 3,
});

const getNominations = () => ({
	instructions:
		"Determine businesses that are nominated, tagged, or recommended to be featured next. Such businesses are often found at the beginning or the end of the email body. Add as many objects as there are businesses nominated. 'nominated_business_location', if not otherwise specified, is usually the same as the location of contact from the email. Nominated business can't be the business that responded with answers. You can figure out website links from nominated business email, or provide social media link as contact. Leave email_template empty. If there are no nominated business or businesses, output empty json.",
	json: `{
		"0": {
			"nominated_business_name": "",
			"nominated_business_location": "",
			"nominated_business_person": "",
			"nominated_business_link": "",
			"email_template": ""
		}
	}`,
	preferred_gpt: models.gpt4,
	top_k: 1,
});

const getCategoryDecline = () => ({
	instructions:
		"If a contact declined to participate, it is important to respect their decision and not further engage them in the campaign. However, you can encourage them to reach out if they ever change their mind. Output ONLY JSON! Make sure to escape the newline characters.",
	preferred_gpt: models.gpt4,
	top_k: 1,
});

const getCategoryUnsubscribe = () => ({
	instructions:
		"If a contact requests to unsubscribe from our email campaign, it's important to respect their decision and we should ensure to take them off our list. Output ONLY JSON! Make sure to escape the newline characters.",
	preferred_gpt: models.gpt4,
	top_k: 1,
});

const getCategoryConfirmation = () => ({
	instructions:
		"Thank the customer for confirming some piece of information, and make sure to follow up with any questions the user might have.  Output ONLY JSON! Make sure to escape the newline characters.",
	preferred_gpt: models.gpt4,
	top_k: 1,
});

const getCategoryAcknowledgment = () => ({
	instructions:
		"Thank the customer for acknowledgment and follow-up. It's important to be short and concise and also to answer any questions the customer might have.  Output ONLY JSON! Make sure to escape the newline characters.",
	preferred_gpt: models.gpt4,
	top_k: 1,
});

const getCategoryQuestion = () => ({
	instructions:
		"Thank the customer for asking the question, and make sure to answer the question in a clear and concise manner. Be direct and polite.  Output ONLY JSON! Make sure to escape the newline characters.",
	preferred_gpt: models.gpt4,
	top_k: 1,
});

const getCategoryNominations = () => ({
	instructions: `Determine businesses that are nominated, tagged, or recommended to be featured next and fill in provided JSON with updated data. Such businesses are often found at the beginning or the end of the email body. Add as many objects as there are businesses nominated. Nominated business can't be the business that responded with answers. For nominated_business_link please provide URL to website, or social media link for nominated business, if available. nominated_business_location is usually the same as the nominator's location. Output ONLY JSON! Leave email_template empty.`,
	json: `{
		"0": {
			"nominated_business_name": "",
			"nominated_business_location": "",
			"nominated_business_person": "",
			"nominated_business_link": "",
			"email_template": ""
		}
	}`,
	template_instructions: `Generate 'Invitation to interview' letter based on the provided template. Make sure to properly fill in missing details in template, and you're free to customize and tailor the letter to the nominated business by following the best general guidelines and practices for email promotions. Do not change questions.`,
	template: `SUBJECT: Invitation to interview - hamlethub.com and NOMINATOR
Hello!
My name is ${email_owner_name} from the Hamlethub.com website - a local news provider in TOWN.
NAME FROM BUSINESS asked us to reach out to you to check if you're willing to participate in an online interview that we're running in TOWN. HE/SHE was very thankful for the opportunity to showcase HIS/HER business, and was happy to nominate you to participate next!
<ADD CUSTOMIZED SENTENCE HERE>
The interview process is completely online, and you can reply with your answers to the following questions:
- Why did you start your business?
- What is your best-selling product/service?
- How many local businesses do you use to support your business (products and services) and can you name them?
- Have you "reimagined" your small business?
Please let me know if you have any questions or if you need any help! Locally yours,
${email_owner_name}
`,
	thankYouNoteInstructions: `Generate a thank you note for a nominator to thank for nominating one or more businesses. Be short and concise. Make sure to escape the newline characters. Also, make sure to confirm any other information, and answer any questions or concerns the customer has.`,
	preferred_gpt: models.gpt4,
	top_k: 1,
});

export {
	getCategorizeEmailPrompt,
	getBusinessDetails,
	getNominations,
	generate_keywords,
	keywords_template,
	qa_request,
	questions_json,
	ai_email_generator_instructions,
	ai_email_generator_JSON,
	getCategoryDecline,
	getCategoryUnsubscribe,
	getCategoryConfirmation,
	getCategoryAcknowledgment,
	getCategoryQuestion,
	getCategoryNominations,
};
