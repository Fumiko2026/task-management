package com.example.taskmanagement;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** アプリ全体の設定。 */
@Configuration
public class AppConfig {

	/** 日時は日本時間(JST)で扱う(要件 NM-10)。テストでは、固定の時計に差し替える。 */
	@Bean
	public Clock clock() {
		return Clock.system(ZoneId.of("Asia/Tokyo"));
	}

}
