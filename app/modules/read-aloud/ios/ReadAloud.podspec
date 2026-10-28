Pod::Spec.new do |s|
  s.name           = 'ReadAloud'
  s.version        = '1.0.0'
  s.summary        = 'Speaks text with the voices installed on the phone'
  s.description    = 'A local Expo module over AVSpeechSynthesizer: which voices are installed for a language and at what quality, and speaking with the best of them.'
  s.author         = ''
  s.homepage       = 'https://thefloor.rvanegas.co'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
