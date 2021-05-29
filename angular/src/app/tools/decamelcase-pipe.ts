import { Pipe, PipeTransform } from '@angular/core';

/**
 * Single upper case letters are treated as a word separator
 * Concurrent upper case letters are treated as single words except if the last letter is proceeded by a single case letter
 * 
 * Examples
 *
 * CamelCase -> Camel case
 * ABCamelCase -> AB camel case
 *
 * CamelCaseAB -> Camel case AB
 */
@Pipe({name: 'decamelcase' })
export class DeCamelCase implements PipeTransform {
	transform(value: string) : string {

		let parts = [];
		let subparts = [];

		let cIndex = 0;

		let prevUpper = false;

		while (cIndex < value.length) {

			var char = value.charAt(cIndex);

			if (cIndex + 1 == value.length) {
				//we are at the last character, just add it
				subparts.push(char);
				break;
			}

			let charCode = value.charCodeAt(cIndex);
			let isUpper = charCode >= 65 && charCode <= 90;

			if (prevUpper && isUpper) {
				//In a run of upper case chars
				subparts.push(char);
			} else if(prevUpper && ! isUpper) {
				
				//We were in the middle of a run of upper case chars and reached the end
				let prevChar = subparts.pop();

				if (cIndex > 1) {
					//Only the first word remains uppercased
					prevChar = prevChar.toLowerCase();
				}

				parts.push(subparts.join(''));

				subparts = [prevChar, char];

			} else if(isUpper && ! prevUpper) {

				parts.push(subparts.join(''));

				subparts = [char];

			} else {
				subparts.push(char);
			}

			prevUpper = isUpper;
			cIndex++;

		}

		if (subparts.length > 0) {
			parts.push(subparts.join(''));
		}

		return parts.join(' ');
	}
}
